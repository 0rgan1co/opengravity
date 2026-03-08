# Njambre (Gravity Claw)

Njambre es un agente de IA personal creado desde cero que funciona localmente (y desplegado en Railway) y usa Telegram como su única interfaz de comunicación.
Está diseñado con una arquitectura modular, enfocada en la privacidad, la seguridad (whitelist de usuarios) y una memoria persistente a lo largo del tiempo.

No es un fork ni depende de plataformas de terceros cerradas. Es una implementación propia, simple, segura y bajo completo control.

## 🚀 Características Principales

- **Interfaz de Telegram:** Usa la mensajería instantánea para interactuar fluidamente (Long Polling, sin requerir servidor web público ni webhooks).
- **Procesamiento de Lenguaje:** Utiliza principalmente la API de Groq (con modelos Llama 3) para ofrecer tiempos de respuesta ultrarrápidos, y OpenRouter como respaldo alternativo.
- **Sistema de Tres Capas de Memoria:** Implementa un innovador sistema de memoria en 3 niveles para que el bot recuerde quién eres, tus datos duros, conversaciones pasadas y referencias con tolerancia a fallos.
- **Ejecución de Herramientas (Tools):** Njambre tiene la capacidad nativa de llamar funciones externas, como buscar la hora actual, agregar conocimientos a diferentes bases de datos o extraer datos estructurados de manera autónoma.
- **Seguridad "Zero Trust":** Sólo responde a los IDs de Telegram previamente autorizados en las variables de entorno (`TELEGRAM_ALLOWED_USER_IDS`). Ignora cualquier otro mensaje que reciba.

## 🧠 El Sistema de Memoria de Tres Niveles (Gravity Claw)

Njambre utiliza un sistema progresivo que ofrece degradación elegante en caso de que alguna conexión a la nube se caiga:

### Tier 1 — Memoria Local de Corto Plazo y Hechos Básicos (SQLite)

* **Volumen persistente:** Diseñado para correr en Railway conectado a un Disco/Volumen en `/data`.
- Qué hace:
  - Guarda los últimos ~20 mensajes para el contexto inmediato (working memory).
  - Almacena `core_memory`: Hechos fundamentales del usuario (quién eres, qué prefieres).
  - Compactadores automáticos: Corre silenciosamente de fondo para resumir ventanas largas de conversación y liberar tokens de la API.

### Tier 2 — Memoria Semántica a Largo Plazo (Pinecone)

* **Vector Database:** Usa Pinecone con *Integrated Embeddings* (`multilingual-e5-large`).
- Qué hace:
  - Sube cada intercambio de mensajes de fondo.
  - Si le preguntas algo de hace 3 meses, el agente calcula la similitud vectorial (Cosine Similarity) de tu pregunta y "recupera" el pedazo de conversación antiguo para anexarlo al prompt del LLM.

### Tier 3 — Almacenamiento Profundo y Logs Estructurados (Supabase)

* **Base de datos relacional:** Usa Supabase (PostgreSQL serverless).
- Qué hace:
  - Tabla `activity_log`: Guarda un log de todas las acciones importantes (tokens gastados, tools ejecutados, metadatos) para analítica de comportamiento.
  - Tabla `data_store`: Permite grabar y leer JSONs estructurados cuando el agente usa sus herramientas (ej. puede guardar una "lista de compras").

## ⚙️ Stack Tecnológico

- **TypeScript** (CommonJS/ES Modules vía `tsx`).
- **Librería de Bot:** `grammy` (El estándar más veloz y moderno para Telegram en TS).
- **LLM SDK:** `openai` (La librería oficial la usamos proxyada hacia Groq/Openrouter).
- **Base de Datos Local:** `better-sqlite3`.
- **Bases de Datos Nube:** `@pinecone-database/pinecone`, `@supabase/supabase-js`.

## 🛠️ Cómo Funciona la Magia (El *Loop* del Agente)

Cuando le escribes un mensaje en Telegram, ocurre lo siguiente:

1. **Autorización**: Verifica que tu "Chat ID" esté en la lista de permitidos.
2. **Preparación de Contexto**:
    - Busca en SQLite tus *hechos principales*.
    - Busca en SQLite los mensajes más recientes.
    - Interroga a Pinecone por el concepto semántico de tu frase.
3. **Generación de Prompt**: Empaqueta todo ese contexto en el System Prompt.
4. **Agent Loop**: Interactúa con Groq permitiéndole decidir qué hacer.
    - Si el modelo de IA dice "Necesito usar mi herramienta *revisar hora*", el ciclo detiene al LLM, procesa el comando TS de la hora local, se lo inyecta como respuesta, y hace que la IA vuelva a pensar.
5. **Respuesta Final**: Te manda un mensaje hermoso a Telegram en formato Markdown.
6. **Extracción en Background** (Silenciosa): Una vez enviado el mensaje hacia tu Telegram, de forma asincrónica:
    - Evalúa si el chat dijo algo "nuevo y permanente" de ti y lo indexa a SQLite core.
    - Guarda el vector en Pinecone de la nueva conversación.
    - Dispara logs a Supabase.

## 📦 Ejecución y Despliegue

### Requisitos Previos en Local

El proyecto usa variables de entorno en el archivo `.env`. Puedes usar `.env.example` y llenar datos como tu Bot Token de BotFather, la Groq API Key, Pinecone, o los pines de Supabase. A nivel base de datos necesitas instalar en las correspondientes nubes:

- Un Índice Pinecone nombrado `gravity-claw` de métrica: `cosine` e Inferencia: `multilingual-e5-large`.
- En Supabase crear dos tablas: `activity_log` y `data_store`.

### Railway (Producción)

Se recomienda desplegar en PaaS usando comandos nativos:

1. Conectar Repo en Railway.
2. Agregar variables globales de `.env.example`.
3. Montar Volume (`/data`) a tu servicio y designar var `DB_PATH='/data/gravity-claw.db'`.
4. El Start Command configurado en el `package.json` compila TypeScript en `node_modules` de caché antes de bootear al Bot (`npm run build && node dist/index.js`).
