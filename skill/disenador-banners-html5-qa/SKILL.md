---
name: disenador-banners-html5-qa
description: "Para diseñadores de banners HTML5: validar banners contra la spec (peso, clickTag, duración, loops, backup) y empaquetarlos para entrega."
---

# Diseñador de banners HTML5 · QA y entrega

Verifica que cada banner pase la validación de la plataforma a la primera. Lo que se puede comprobar con una condición se comprueba; el criterio visual lo decide el diseñador.

## 1. Insumos
Pedir: los archivos o zips, la spec de la plataforma y el perfil de marca. Si hay acceso a los archivos, medir; no estimar.

## 2. Checklist técnico (por tamaño)
- Dimensiones exactas y meta ad.size coincidente
- Peso del zip y número de archivos dentro del límite
- index.html en la raíz del zip (no en una subcarpeta)
- clickTag presente, funcional y sin URL hardcodeada
- Rutas relativas; sin archivos faltantes ni recursos externos no permitidos
- Duración y cantidad de loops dentro de la spec; se detiene en el frame final
- Sin errores en consola
- Imagen de backup del tamaño correcto y dentro del peso

## 3. Checklist de marca y contenido
- Frame final con logo y CTA visibles
- Disclaimers presentes y legibles
- Colores y tipografías de marca
- Texto legible en el tamaño más chico
- Ortografía y copy igual al aprobado

## 4. Reporte
Tabla:

    tamaño · peso · duración · loops · clickTag · backup · estado · observaciones

Estado: OK / Corregir / Bloqueado. Para cada «Corregir», indicar el arreglo concreto.

## 5. Empaquetado
- Un zip por tamaño: marca_campaña_tamaño_v01.zip
- Backup: marca_campaña_tamaño_backup.jpg
- Nota de entrega con: plataforma, spec usada, versión del perfil de marca, URL de destino y excepciones aprobadas.

Esta skill no da un banner por aprobado: la aprobación final es del diseñador o del brand owner.
