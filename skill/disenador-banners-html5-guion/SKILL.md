---
name: disenador-banners-html5-guion
description: "Para diseñadores de banners HTML5: definir spec, storyboard frame por frame y plan de adaptación multi-tamaño antes de producir."
---

# Diseñador de banners HTML5 · Spec y storyboard

Planifica el set de banners antes de programar, para que no haya sorpresas de peso, duración o legibilidad.

## 1. Contexto de marca
Confirmar: paleta en hex, tipografías (y licencia web), logo en SVG, márgenes mínimos, disclaimers obligatorios y copy aprobado por frame. Si no hay copy aprobado, pedirlo; no inventar ofertas ni precios.

## 2. Spec
No avanzar sin:

    plataforma   Google Ads · CM360/DV360 · DSP/IAB genérico · otro
    tamaños      ej.: 300x250, 728x90, 160x600, 300x600, 320x50, 970x250
    peso máx.    por zip o carga inicial (suele ser 150 KB; confirmar)
    duración     habitual: 30 s máx.
    loops        habitual: 3 máx., frenando en el frame final
    salida       clickTag / exit de la plataforma · URL de destino
    backup       imagen estática requerida

Las specs cambian: si el usuario no confirmó la vigente, señalarlo.

Viabilidad: si el pedido no entra en peso o duración (ej.: video pesado en 150 KB), frenar y ofrecer alternativas.

## 3. Storyboard
Por frame:

    frame · tiempo · texto en pantalla · elementos visuales · animación (entrada/salida)

Estructura base:

    frame 1  gancho (0–3 s)
    frame 2  mensaje / beneficio
    frame 3  cierre: logo + CTA visibles

- El último frame debe funcionar solo; es también el backup.
- Texto por frame: pocas palabras, legible en el tamaño más chico (~10–11 px mínimo).
- Tiempo de lectura suficiente por frame (al menos ~2 s para un titular corto).

## 4. Plan multi-tamaño
Definir un master (normalmente 300x250) y cómo se adapta por familia:
- Horizontal (728x90, 970x250): lectura izquierda a derecha, menos texto.
- Vertical (160x600, 300x600): apilado, logo arriba o abajo.
- Mobile (320x50, 320x100): una idea, CTA grande.
Indicar qué tamaños necesitan copy reducido.

## 5. Entrega
Texto plano con: spec confirmada, storyboard del master, notas de adaptación por tamaño y riesgos detectados. Se aprueba el master antes de producir el resto.
