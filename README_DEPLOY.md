# Modelos, API y despliegue · Café Insights (Etapa 2)

Los notebooks entrenan los modelos y exportan sus artefactos a `modelo/`. La API (`api.py`, FastAPI) los carga, calcula las predicciones y sirve tanto los datos como la aplicación web (`index.html`, `styles.css`, `script.js`).

```
notebooks  ──►  modelo/ (joblib + resultados.json)  ──►  api.py (FastAPI)  ──►  index.html + styles.css + script.js
```

---

## 1. Estructura del proyecto

```
cafeteria/                              <- raíz del repositorio
├── EDA.ipynb                           <- análisis exploratorio, diagnóstico y propuesta (ver README.md)
├── modelo_random_forest.ipynb          <- flujo completo del RandomForestRegressor y comparación final
├── modelo_linear_regression.ipynb      <- flujo completo de la regresión lineal de referencia
├── api.py                              <- backend FastAPI
├── index.html · styles.css · script.js <- frontend
├── README.md                           <- documentación del EDA
├── README_DEPLOY.md                    <- este archivo
├── dataset_cafeteria.csv               <- datos de entrada (solo lo usan los notebooks)
├── datos/
│   └── dataset_procesado.csv           <- lo genera modelo_random_forest.ipynb; lo usa la regresión lineal
└── modelo/                             <- artefactos generados por los notebooks
    ├── modelo.joblib                   <- RandomForestRegressor (modelo principal)
    ├── encoder.joblib                  <- OneHotEncoder del café
    ├── linear_regression_model.joblib  <- LinearRegression (modelo de referencia)
    └── resultados.json                 <- métricas, comparación de modelos, textos y datos del ranking
```

`datos/` y `modelo/` son salidas de los notebooks (no código fuente). La API no necesita `dataset_cafeteria.csv` ni `datos/`.

---

## 2. Modelos

| Notebook | Qué hace | Genera |
|---|---|---|
| `modelo_random_forest.ipynb` | Preparación, variables, objetivo, partición temporal, `GridSearchCV`, entrenamiento, evaluación, importancia, predicción de negocio, **comparación final** con la regresión lineal y exportación | `modelo/modelo.joblib`, `modelo/encoder.joblib`, `modelo/resultados.json`, `datos/dataset_procesado.csv` |
| `modelo_linear_regression.ipynb` | Carga del dataset procesado, partición, entrenamiento, evaluación y exportación de `LinearRegression()` | `modelo/linear_regression_model.joblib` |

**Orden de ejecución:** primero `modelo_random_forest.ipynb` y después `modelo_linear_regression.ipynb`, que usa el dataset procesado del primero. `EDA.ipynb` es independiente.

El **Random Forest es el modelo principal** y el recomendado por la comparación final: gana 2 de 3 criterios (robustez temporal y orden de los cafés). La regresión lineal tiene un error ligeramente menor en el período de prueba, pero esa diferencia no es estadísticamente distinguible. Las cifras y la justificación completas están en la sección "Comparación de Modelos" de la aplicación y en el notebook.

> Entrená y serví los modelos en el mismo entorno: los archivos `.joblib` dependen de la versión de scikit-learn con la que se generaron. Si cambiás de entorno, volvé a ejecutar los notebooks.

---

## 3. API FastAPI (`api.py`)

Al iniciar carga los dos modelos, el encoder y `resultados.json`; si falta alguno, indica cuál. Documentación interactiva automática en `/docs`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/salud` | Estado de la API, modelos disponibles y cafés |
| `GET` | `/api/resultados` | Datos de la aplicación web: métricas, comparación de modelos, importancia, hallazgos, conclusiones y el ranking calculado en vivo |
| `GET` | `/api/ranking?modelo=random_forest` | Ranking de rentabilidad esperada del próximo mes (`modelo`: `random_forest` o `linear_regression`) |
| `POST` | `/api/predecir?modelo=random_forest` | Rentabilidad esperada a 30 días para los cafés enviados |
| `GET` | `/`, `/styles.css`, `/script.js` | Aplicación web |

Ejemplo de predicción:

```bash
curl -X POST "http://127.0.0.1:8000/api/predecir?modelo=random_forest" \
  -H "Content-Type: application/json" \
  -d '{"cafes": [{"cafe": "Latte", "compras_7d": 20, "compras_14d": 41, "compras_30d": 73, "ingresos_7d": 715.2, "ingresos_30d": 2610, "precio_actual": 35.76, "tendencia": 1.174, "participacion_30d": 0.1746, "pct_noche_30d": 0.2192, "pct_finde_30d": 0.08219}]}'
```

Los valores de entrada son los que calcula `armar_tabla_cafe` en el notebook; un café que no esté entre los ocho entrenados devuelve error 422.

---

## 4. Frontend

La interfaz depende solo de `index.html`, `styles.css` y `script.js`, sin librerías externas ni archivos de imagen aparte: la fotografía de fondo (interior de la cafetería, optimizada) está embebida al final de `styles.css`. Al cargar, `script.js` pide `/api/resultados` y dibuja todas las secciones: resumen, metodología, métricas, comparación de modelos, importancia, ranking, hallazgos y conclusiones.

- Si la API está en el mismo servidor (caso normal), las rutas son relativas.
- Si se abre `index.html` como archivo, apunta a `http://127.0.0.1:8000` (la API habilita CORS).
- Sin API, la página muestra un aviso con el comando para iniciarla.

---

## 5. Ejecución local

```bash
# 1. Dependencias
pip install pandas numpy scipy matplotlib scikit-learn joblib jupyter fastapi "uvicorn[standard]"

# 2. Entrenar y exportar los modelos (en este orden)
jupyter nbconvert --to notebook --execute --inplace modelo_random_forest.ipynb
jupyter nbconvert --to notebook --execute --inplace modelo_linear_regression.ipynb

# 3. Iniciar la API (sirve también la aplicación web)
uvicorn api:app --reload
```

Abrir `http://127.0.0.1:8000` para la aplicación y `http://127.0.0.1:8000/docs` para la documentación de la API.

La API también arranca con `python api.py`, o con el botón **Run Python File** (▷) de VS Code. Si en Git Bash el botón falla con `Invalid argument` por los espacios y paréntesis de la ruta, cambiá la terminal por defecto: `Ctrl + Shift + P` → *Terminal: Select Default Profile* → **PowerShell**.

---

## 6. Deploy

La aplicación ahora necesita un servidor Python (la API), por lo que GitHub Pages ya no alcanza. Una opción gratuita es **Render**; cualquier servicio que ejecute `uvicorn` funciona igual.

1. Subir a un repositorio de GitHub: `api.py`, `index.html`, `styles.css`, `script.js` y la carpeta `modelo/` con sus cuatro archivos (con los modelos ya entrenados). Los notebooks y los datos son opcionales.
2. En Render: **New → Web Service** y conectar el repositorio.
3. Configurar:
   - **Runtime:** Python 3.
   - **Build Command:** `pip install fastapi "uvicorn[standard]" pandas numpy scikit-learn joblib`
   - **Start Command:** `uvicorn api:app --host 0.0.0.0 --port $PORT`
4. Elegir el plan gratuito y crear el servicio. Render muestra la URL cuando termina.

**URL final esperada:** `https://<nombre-del-servicio>.onrender.com`

Para que los modelos carguen sin problemas, fijá en el Build Command la versión de scikit-learn con la que se entrenaron (`python -c "import sklearn; print(sklearn.__version__)"`), por ejemplo `scikit-learn==<versión>`. En los planes gratuitos el servicio puede tardar unos segundos en responder tras un período sin uso.

---

## 7. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| La API no inicia y menciona archivos faltantes en `modelo/` | No se ejecutaron los notebooks | Ejecutar `modelo_random_forest.ipynb` y luego `modelo_linear_regression.ipynb` |
| El segundo notebook falla porque no encuentra `datos/dataset_procesado.csv` | Se ejecutó antes que el Random Forest | Ejecutar primero `modelo_random_forest.ipynb` |
| La página muestra "No se pudieron cargar los datos desde la API" | La API no está iniciada o se abrió otra URL | Iniciar `uvicorn api:app` y abrir `http://127.0.0.1:8000` |
| Advertencia o error al cargar un `.joblib` | Versión de scikit-learn distinta a la del entrenamiento | Reentrenar en el mismo entorno o igualar la versión |
| No aparecen los cambios | Caché del navegador | Recargar con `Ctrl + F5` |

---

## 8. Notas

- Los archivos `.joblib` solo deben cargarse desde fuentes confiables, como cualquier archivo serializado con `pickle`.
- `dataset_cafeteria.csv` contiene IDs de tarjeta anonimizados; si el repositorio es público, no es necesario subirlo para desplegar.
