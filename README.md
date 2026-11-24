# Proyecto — Análisis de Datos de una Cafetería
### Ciencia de Datos · Diagnóstico, Propuesta y Análisis Exploratorio (EDA)

## 🎯 Descripción

Este documento describe el **Análisis Exploratorio de Datos (EDA)** sobre las ventas de una cafetería, a partir de un único archivo (`dataset_cafeteria.csv`). El notebook `EDA.ipynb` reúne el EDA, el **diagnóstico de la situación de los datos (Capa 1)** y una **propuesta de nueva área de datos (Capa 2)**, junto con la decisión de cuál atender primero.

Objetivos:

- Entender la estructura, la calidad y el comportamiento de los datos de ventas de la cafetería.
- Identificar el principal problema de datos que existe hoy en la organización (Capa 1).
- Proponer un área de datos que todavía no existe y que aportaría valor al negocio (Capa 2).
- Justificar con evidencia cuál de las dos capas debe abordarse primero.

El notebook no incluye modelado; toda conclusión surge de evidencia calculada en el propio análisis. Los modelos predictivos, la API y el despliegue se documentan en `README_DEPLOY.md`.

---

## 📊 Dataset utilizado

- **Archivo:** `dataset_cafeteria.csv` (única fuente de datos del proyecto).
- **Descripción:** registro de ventas de una cafetería, una fila por producto vendido.
- **Tamaño:** 3.898 filas × 6 columnas.
- **Período:** 01/03/2024 a 23/03/2025.

### Columnas del dataset

| Columna | Descripción |
|---|---|
| `date` | Fecha de la venta (texto, AAAA-MM-DD) |
| `datetime` | Hora de la venta (HH:MM); no incluye la fecha |
| `cash_type` | Medio de pago: `card` o `cash` |
| `card` | ID anonimizado de tarjeta (tiene valores nulos) |
| `money` | Monto de la venta; el dataset no indica moneda |
| `coffee_name` | Nombre del producto |

---

---

## 🔬 EDA

| Archivo | Contenido |
|---|---|
| `EDA.ipynb` | Notebook completo: EDA, Capa 1 (Diagnóstico), Capa 2 (Propuesta) y conclusiones |
| `dataset_cafeteria.csv` | Dataset de ventas de la cafetería |

### Secciones del notebook

1. **Introducción**, **Carga de librerías** y **Carga de datos**
2. **Exploración inicial:** forma, tipos de dato, estadísticas descriptivas y orden del archivo
3. **Calidad de datos:** nulos, duplicados, validez, consistencia y actualidad, con resumen de las seis dimensiones
4. **Análisis exploratorio (EDA):** variables categóricas y numéricas, productos (volumen frente a ingresos), tendencias temporales, demanda por hora y día, clientes y correlaciones
5. **Hallazgos principales**
6. **Relación con la Capa 1 (Diagnóstico)**, que incluye el diagnóstico completo: problema identificado, cultura de datos, calidad de datos, stack y Data Warehouse, y conclusión
7. **Relación con la Capa 2 (Propuesta)**, que incluye la propuesta completa: área de datos, objetivo, beneficios, implementación, relación con la Capa 1 y priorización
8. **Conclusiones**

---

**Tecnologías:** Python 3, pandas, NumPy, Matplotlib y Jupyter Notebook.

**Ejecución:**

```bash
pip install pandas numpy matplotlib jupyter
jupyter notebook EDA.ipynb
```

Colocar `dataset_cafeteria.csv` en la misma carpeta y ejecutar todas las celdas en orden (*Run All*). El notebook lee el archivo local y no requiere conexión a internet.

---

## 🔎 Principales hallazgos

- **Captura no estandarizada:** el archivo une dos registros con criterios distintos. La fecha retrocede en la fila 3636 y ese segundo bloque (262 filas) repite 41 días del primero, agregando un 35,3 % de filas a febrero–marzo de 2025.
- **Datos de clientes incompletos:** `card` tiene 351 nulos (9,0 %); 182 son pagos con tarjeta sin ID y todos están en el segundo bloque.
- **Sin identificador de transacción ni catálogo:** hay 16 duplicados exactos imposibles de validar y 34 etiquetas de producto (33 al normalizar mayúsculas).
- **Precios por períodos:** cada producto tiene cuatro precios en períodos consecutivos (cambios hacia el 20/04, 06/07 y 28/09 de 2024), sin una lista de precios que los respalde.
- **Productos:** tres productos concentran el 60,1 % de las compras con tarjeta; `Latte` es primero en ingresos y segundo en compras.
- **Demanda:** se reparte durante todo el día (33,3 % por la mañana, 40,7 % entre las 12 y las 17 h, 26,1 % desde las 18 h) y el mix de productos cambia según la franja.
- **Clientes:** el 58,6 % de las tarjetas identificadas compró una sola vez, y el 10 % con más compras explica el 50,6 % del total.
- **Priorización:** se aborda primero la Capa 1 (corregir la captura) y después la Capa 2 (analítica comercial de demanda y clientes), porque cada indicador propuesto depende de datos que hoy no son confiables.

Las cifras de productos, horarios y clientes son una lectura preliminar sobre el bloque A con pagos con tarjeta, la captura más consistente del período; no son totales definitivos.

---

---

## 👤 Autor

*Completar con nombre y apellido del autor.*
