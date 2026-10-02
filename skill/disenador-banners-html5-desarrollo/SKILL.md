---
name: disenador-banners-html5-desarrollo
description: "Para diseñadores de banners HTML5: programar banners animados livianos (HTML, CSS, JS) con clickTag, listos para Google Ads, CM360 o DSP."
---

# Diseñador de banners HTML5 · Desarrollo

Programar el banner a partir de un storyboard y una spec aprobados. Si no existen, pedirlos primero.

## 1. Estructura
- Un index.html por tamaño, con CSS y JS inline.
- Assets en la misma carpeta, rutas relativas, sin subcarpetas innecesarias.
- Declarar el tamaño:

    <meta name="ad.size" content="width=300,height=250">

- Contenedor con ancho y alto fijos, overflow hidden y cursor pointer.

## 2. Salida (clickTag)
Usar la variable de la plataforma; nunca la URL hardcodeada en el click:

    <script>var clickTag = "https://www.ejemplo.com";</script>
    <a href="javascript:window.open(window.clickTag)">…</a>

Ajustar a la implementación exacta que exija la plataforma (Google Ads, CM360/Studio y algunos DSP difieren, por ejemplo con Enabler o exits nombrados).

## 3. Animación
- Preferir CSS (@keyframes) animando solo transform y opacity.
- Usar GSAP u otra librería solo si la plataforma la sirve desde su CDN sin contar peso.
- Respetar duración y loops de la spec; al terminar, quedar quieto en el frame final.
- Contemplar prefers-reduced-motion mostrando directamente el frame final.

## 4. Peso y assets
- Imágenes optimizadas: WebP o JPG comprimido para fotos, PNG-8 para planos, SVG para logo e íconos.
- Exportar a 2x solo si el peso lo permite.
- Fuentes: subset mínimo o titulares convertidos a SVG si la fuente pesa demasiado.
- Sin llamadas a red externas, sin localStorage, sin audio automático.

## 5. Detalles de display
- Borde de 1 px si el fondo es blanco o muy claro.
- Todo el banner clickeable.
- Colores solo de la paleta de marca.

## 6. Entrega
Código completo de cada index.html, lista de assets con su peso estimado y el peso total por tamaño. Si algún tamaño queda cerca del límite, decirlo y proponer qué recortar.
