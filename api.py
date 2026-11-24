"""API de Café Insights (FastAPI): carga los modelos entrenados y sirve predicciones, datos y la aplicación web.

Uso local (cualquiera de las dos):
    python api.py                 # también con el botón "Run Python File" de VS Code
    uvicorn api:app --reload

Requiere los artefactos que generan los notebooks en `modelo/`:
modelo.joblib, encoder.joblib, resultados.json (modelo_random_forest.ipynb) y
linear_regression_model.joblib (modelo_linear_regression.ipynb).
"""
import json
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent
RUTA_MODELO = BASE / "modelo"
ARCHIVOS_MODELOS = {"random_forest": "modelo.joblib", "linear_regression": "linear_regression_model.joblib"}
VARIABLES_NUMERICAS = ["compras_7d", "compras_14d", "compras_30d", "ingresos_7d", "ingresos_30d",
                       "precio_actual", "tendencia", "participacion_30d", "pct_noche_30d", "pct_finde_30d"]

ARTEFACTOS = {}


def cargar_artefactos():
    """Carga los modelos, el encoder y los resultados exportados por los notebooks."""
    esperados = [*ARCHIVOS_MODELOS.values(), "encoder.joblib", "resultados.json"]
    faltantes = [n for n in esperados if not (RUTA_MODELO / n).exists()]
    if faltantes:
        raise RuntimeError(f"Faltan archivos en 'modelo/': {', '.join(faltantes)}. "
                           "Ejecutá modelo_random_forest.ipynb y luego modelo_linear_regression.ipynb.")
    ARTEFACTOS["modelos"] = {nombre: joblib.load(RUTA_MODELO / archivo) for nombre, archivo in ARCHIVOS_MODELOS.items()}
    ARTEFACTOS["encoder"] = joblib.load(RUTA_MODELO / "encoder.joblib")
    ARTEFACTOS["resultados"] = json.loads((RUTA_MODELO / "resultados.json").read_text(encoding="utf-8"))


@asynccontextmanager
async def ciclo_de_vida(app):
    cargar_artefactos()
    yield


app = FastAPI(title="Café Insights API", version="1.0", lifespan=ciclo_de_vida)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


# ---------- Predicción ----------
class CaracteristicasCafe(BaseModel):
    cafe: str
    compras_7d: float
    compras_14d: float
    compras_30d: float
    ingresos_7d: float
    ingresos_30d: float
    precio_actual: float
    tendencia: float
    participacion_30d: float
    pct_noche_30d: float
    pct_finde_30d: float


class SolicitudPrediccion(BaseModel):
    cafes: list[CaracteristicasCafe]


def obtener_modelo(nombre):
    if nombre not in ARTEFACTOS["modelos"]:
        raise HTTPException(404, f"Modelo desconocido: '{nombre}'. Opciones: {', '.join(ARCHIVOS_MODELOS)}.")
    return ARTEFACTOS["modelos"][nombre]


def armar_matriz(tabla, modelo):
    """Variables numéricas + café codificado, en el orden con que se entrenó el modelo."""
    encoder = ARTEFACTOS["encoder"]
    codificado = pd.DataFrame(encoder.transform(tabla[["cafe"]]), columns=encoder.get_feature_names_out(["cafe"]), index=tabla.index)
    return pd.concat([tabla[VARIABLES_NUMERICAS], codificado], axis=1).reindex(columns=modelo.feature_names_in_, fill_value=0)


def calcular_ranking(nombre_modelo="random_forest"):
    """Ranking de rentabilidad esperada del próximo mes, calculado en vivo con el modelo elegido."""
    modelo = obtener_modelo(nombre_modelo)
    tabla = pd.DataFrame(ARTEFACTOS["resultados"]["caracteristicas_hoy"])
    matriz = armar_matriz(tabla, modelo)
    tabla["estimada"] = modelo.predict(matriz)
    if hasattr(modelo, "estimators_"):      # dispersión entre los árboles del bosque (no es un intervalo estadístico)
        por_arbol = np.array([arbol.predict(matriz.to_numpy()) for arbol in modelo.estimators_])
        tabla["p10"], tabla["p90"] = np.percentile(por_arbol, [10, 90], axis=0)
    else:
        tabla["p10"] = tabla["p90"] = None

    tabla["peso"] = tabla["estimada"] / tabla["estimada"].sum()
    tabla["variacion"] = np.where(tabla["ingresos_30d"] > 0, tabla["estimada"] / tabla["ingresos_30d"].replace(0, np.nan) - 1, np.nan)
    tabla = tabla.sort_values("estimada", ascending=False).reset_index(drop=True)

    def redondear(valor, decimales):
        return None if pd.isna(valor) else round(float(valor), decimales)

    return [{"puesto": i + 1, "cafe": r["cafe"], "estimada": redondear(r["estimada"], 2), "peso": redondear(r["peso"], 4),
             "p10": redondear(r["p10"], 2), "p90": redondear(r["p90"], 2), "ultimos_30d": redondear(r["ingresos_30d"], 2),
             "variacion": redondear(r["variacion"], 4), "precio_actual": redondear(r["precio_actual"], 2),
             "compras_30d": int(r["compras_30d"]), "tendencia": redondear(r["tendencia"], 3),
             "participacion": redondear(r["participacion_30d"], 4)}
            for i, r in tabla.iterrows()]


# ---------- Endpoints ----------
@app.get("/api/salud")
def salud():
    return {"estado": "ok", "modelos": list(ARCHIVOS_MODELOS), "cafes": [str(c) for c in ARTEFACTOS["encoder"].categories_[0]]}


@app.get("/api/resultados")
def resultados():
    """Datos de la aplicación web: métricas, comparación de modelos, textos y ranking calculado en vivo."""
    return {**ARTEFACTOS["resultados"], "ranking": calcular_ranking("random_forest")}


@app.get("/api/ranking")
def ranking(modelo: str = Query("random_forest", description="random_forest o linear_regression")):
    return calcular_ranking(modelo)


@app.post("/api/predecir")
def predecir(solicitud: SolicitudPrediccion, modelo: str = Query("random_forest", description="random_forest o linear_regression")):
    """Rentabilidad esperada de los próximos 30 días para los cafés enviados."""
    cafes_validos = [str(c) for c in ARTEFACTOS["encoder"].categories_[0]]
    desconocidos = sorted({c.cafe for c in solicitud.cafes} - set(cafes_validos))
    if desconocidos:
        raise HTTPException(422, f"Café desconocido: {', '.join(desconocidos)}. Opciones: {', '.join(cafes_validos)}.")
    modelo_elegido = obtener_modelo(modelo)
    tabla = pd.DataFrame([c.model_dump() for c in solicitud.cafes])
    estimadas = modelo_elegido.predict(armar_matriz(tabla, modelo_elegido))
    return {"modelo": modelo, "horizonte_dias": ARTEFACTOS["resultados"]["meta"]["horizonte_dias"],
            "predicciones": [{"cafe": c, "rentabilidad_estimada": round(float(v), 2)} for c, v in zip(tabla["cafe"], estimadas)]}


# ---------- Aplicación web (frontend) ----------
@app.get("/", include_in_schema=False)
def inicio():
    return FileResponse(BASE / "index.html")


@app.get("/styles.css", include_in_schema=False)
def estilos():
    return FileResponse(BASE / "styles.css", media_type="text/css")


@app.get("/script.js", include_in_schema=False)
def script():
    return FileResponse(BASE / "script.js", media_type="text/javascript")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True)
