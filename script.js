/* ============================================
   TUTORIA - SCRIPT.JS
   Lógica completa de la aplicación
   ============================================ */

// CONFIGURACIÓN
const MODEL = "meta-llama/llama-2-70b-chat";

const SYSTEM_PROMPT = `Eres TutorIA, tutor socrático pedagógico experto. Tu objetivo: que el estudiante ENTIENDA de verdad.

ESTRATEGIA:
1. PREGUNTA primero qué sabe del tema (no des respuesta directa)
2. Basándote en su respuesta, EXPLICA bien con analogías simples
3. VERIFICA comprensión: "¿Esto tiene sentido?" o "¿Hay alguna parte confusa?"
4. Si dice "sí" o "entendí" → CONTINÚA profundizando poco a poco
5. Si dice "no" o "confuso" → CAMBIA estrategia con ejemplos diferentes

⚠️ IMPORTANTE - REGLAS SOBRE QUIZES:
- NUNCA generes opciones de respuesta en texto (A), B), C), D))
- NUNCA muestres preguntas con opciones literales en tu respuesta
- Solo sugiere: "¿Quieres hacer un Quiz rápido para practicar?"
- NO des opciones de múltiple opción en texto - las opciones son interactivas en la app
- El sistema mostrará automáticamente los quizes con radio buttons

IMPORTANTE - NO APURES:
- Responde en 5-7 líneas máximo (no cortado)
- USA emojis ocasionales para hacer ameno
- DESPUÉS DE 2-3 INTERCAMBIOS: pregunta "¿Quieres hacer un Quiz rápido para practicar o prefieres una Explicación?"
- Solo ofrece Quiz/Explicación cuando el estudiante ya entienda bien el tema

Tono: Paciente, empático, motivador. Eres su profe, no Wikipedia.`;


// ======== SISTEMA DE ROTACIÓN DE API KEYS CON EMAILS ========
const API_KEYS_ORIGINAL = [
    {
        key: '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',
        email: 'lavadorala7@gmail.com'
    },
    {
        key: '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',
        email: 'chanchacochina21@gmail.com'
    },
    {
        key: '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',
        email: 'af9728622@gmail.com'
    },
    {
        key: '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',
        email: 'andresburgo38@gmail.com'
    }
];

// Lista actualizada que se modifica durante ejecución
let API_KEYS_POOL = JSON.parse(JSON.stringify(API_KEYS_ORIGINAL));
let currentKeyIndex = 0;

/**
 * Obtiene la API key actual del pool
 * @returns {string|null} API key o null si no hay disponible
 */
function getCurrentApiKey() {
    if (currentKeyIndex >= API_KEYS_POOL.length) return null;
    return API_KEYS_POOL[currentKeyIndex].key;
}

/**
 * Obtiene el email actual asociado a la API key
 * @returns {string} Email del dueño de la API key actual
 */
function getCurrentEmail() {
    if (currentKeyIndex >= API_KEYS_POOL.length) return 'N/A';
    return API_KEYS_POOL[currentKeyIndex].email;
}

/**
 * Rota hacia la siguiente API key disponible
 * Si se agotan todas, reinicia la lista desde la original
 * @returns {boolean} true si hay más keys disponibles
 */
function rotateApiKey() {
    currentKeyIndex++;
    if (currentKeyIndex >= API_KEYS_POOL.length) {
        console.warn('⚠️ [API KEYS] Se agotaron todas las claves. Reiniciando lista original...');
        // Reiniciar lista desde la original
        API_KEYS_POOL = JSON.parse(JSON.stringify(API_KEYS_ORIGINAL));
        currentKeyIndex = 0;
        console.log('♻️ [API KEYS] Lista reiniciada desde la original');
        console.log(`📧 [CORREO ACTIVO] ${getCurrentEmail()}`);
        return true;
    }
    console.log(`🔄 [API KEYS] Rotando a la siguiente API key. Índice actual: ${currentKeyIndex + 1}/${API_KEYS_POOL.length}`);
    console.log(`📧 [CORREO ACTIVO] ${getCurrentEmail()}`);
    return true;
}

/**
 * Marca una API key como inválida y la rota
 * Se llama cuando recibimos 400, 401, 403 o similar
 */
function invalidateCurrentKey(errorCode) {
    const invalidEmail = getCurrentEmail();
    const invalidKey = API_KEYS_POOL[currentKeyIndex].key;
    
    console.warn(`⚠️ [API KEYS] API key inválida (Error ${errorCode})`);
    console.warn(`❌ [CORREO FALLIDO] ${invalidEmail}`);
    console.warn(`❌ [CLAVE FALLIDA] ${invalidKey.substring(0, 30)}...`);
    
    // Eliminar esta clave del pool
    API_KEYS_POOL.splice(currentKeyIndex, 1);
    
    // No incrementar índice porque ya eliminámos el elemento
    // La siguiente key estará en el mismo índice
    if (currentKeyIndex >= API_KEYS_POOL.length && API_KEYS_POOL.length > 0) {
        currentKeyIndex = 0;
        console.log('🔄 [API KEYS] Reiniciando índice a 0');
    }
    
    console.log(`✅ [API KEYS] Clave eliminada. Pool restante: ${API_KEYS_POOL.length} claves`);
    
    // Mostrar nueva clave activa si hay disponible
    if (API_KEYS_POOL.length > 0) {
        console.log(`✅ [CORREO ACTIVO AHORA] ${getCurrentEmail()}`);
    }
}

/**
 * Elimina la API key actual del pool (por error 401/403)
 */
function removeCurrentKey() {
    if (currentKeyIndex < API_KEYS_POOL.length) {
        const removedEmail = API_KEYS_POOL[currentKeyIndex].email;
        API_KEYS_POOL.splice(currentKeyIndex, 1);
        console.warn(`❌ [CORREO REMOVIDO] ${removedEmail}`);
    }
}

// ======== ESTADO GLOBAL ========
let userName = localStorage.getItem('tutoria_userName') || '';
let currentChatId = localStorage.getItem('tutoria_currentChatId') || Date.now().toString();
let chats = JSON.parse(localStorage.getItem('tutoria_chats') || '{}');

// Crear nuevo chat al entrar
currentChatId = Date.now().toString();
chats[currentChatId] = { messages: [], title: 'Nuevo Chat', createdAt: new Date().toISOString() };

let messages = chats[currentChatId].messages;
let isQuizMode = false;
let lastQuiz = null;
let darkMode = localStorage.getItem('tutoria_darkMode') !== 'false';
let exchangeCount = 0; // ← NUEVO: Contador de intercambios para saber cuándo ofrecer quiz

// ======== REFERENCIAS AL DOM ========
const welcome = document.getElementById('welcome');
const app = document.getElementById('app');
const nameInput = document.getElementById('nameInput');
const startBtn = document.getElementById('startBtn');
const greetingName = document.getElementById('greetingName');
const messagesDiv = document.getElementById('messages');
const input = document.getElementById('input');
const send = document.getElementById('send');
const empty = document.getElementById('empty');
const scanBtn = document.getElementById('scanBtn');
const imagePreview = document.getElementById('imagePreview');
const removeImage = document.getElementById('removeImage');
const imageInput = document.getElementById('imageInput');
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const closeSidebar = document.getElementById('closeSidebar');
const newChatBtn = document.getElementById('newChatBtn');
const chatList = document.getElementById('chatList');
const themeBtn = document.getElementById('themeBtn');
const messagesArea = document.getElementById('messagesArea');

let selectedImage = null;
let isInQuizMode = false;
let quizAnswers = {};
let isShowingQuizOptions = false;
let newChatDebounce = false;
let quizFinalized = false; // ✅ Bandera para saber si el quiz final fue completado

// ======== GESTIÓN DE TEMAS (CLARO/OSCURO) ========
/**
 * Aplica el tema almacenado en darkMode
 * Añade/elimina clase light-theme del body
 */
function applyTheme() {
    if (!darkMode) {
        document.body.classList.add('light-theme');
        themeBtn.innerHTML = '<i data-lucide="sun" class="w-6 h-6"></i>';
    } else {
        document.body.classList.remove('light-theme');
        themeBtn.innerHTML = '<i data-lucide="moon" class="w-6 h-6"></i>';
    }
    localStorage.setItem('tutoria_darkMode', darkMode);
    lucide.createIcons();
}
applyTheme();

// Event listener para botón de tema
themeBtn.onclick = () => {
    darkMode = !darkMode;
    applyTheme();
};

// ======== GENERADOR DE EFECTOS VISUALES ========
/**
 * Crea estrellas y partículas animadas en el fondo
 */
function createStars() {
    const container = document.getElementById('particles');
    // Crear 150 estrellas
    for(let i = 0; i < 150; i++) {
        const star = document.createElement('div');
        star.classList.add('stars');
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.animationDelay = Math.random() * 6 + 's';
        container.appendChild(star);
    }
    // Crear 30 partículas flotantes
    for(let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.classList.add('particle');
        p.style.width = p.style.height = Math.random() * 5 + 3 + 'px';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDuration = Math.random() * 20 + 15 + 's';
        p.style.animationDelay = Math.random() * 10 + 's';
        container.appendChild(p);
    }
}
createStars();

// ======== INICIO DE APP ========
/**
 * Verifica si el usuario ya tiene nombre guardado y lo carga
 */
let hasValidatedName = false; // ✅ DECLARAR AQUÍ PRIMERO

if(userName && userName.trim().length > 0) {
    hasValidatedName = true; // Marcar como ya validado si hay nombre guardado
    startApp(userName);
} else {
    welcome.classList.remove('hidden');
    app.classList.add('hidden');
}

/**
 * Valida el input del nombre y habilita/deshabilita el botón
 */
function validateNameInput() {
    const name = nameInput.value.trim();
    if (name.length >= 1) {
        startBtn.removeAttribute('disabled');
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';
    } else {
        startBtn.setAttribute('disabled', 'disabled');
        startBtn.style.opacity = '0.5';
        startBtn.style.cursor = 'not-allowed';
    }
}

// Event listener para validar nombre en tiempo real
nameInput.addEventListener('input', validateNameInput);
nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && nameInput.value.trim().length >= 1) {
        startBtn.click();
    }
});

// Inicializar estado del botón como deshabilitado
startBtn.setAttribute('disabled', 'disabled');

// Event listener para botón "Comenzar"
startBtn.onclick = () => {
    const name = nameInput.value.trim();
    if(name && name.length >= 1) {
        userName = name;
        localStorage.setItem('tutoria_userName', name);
        hasValidatedName = true; // ✅ Marcar como validado
        startApp(name);
    } else {
        console.warn('⚠️ [VALIDACIÓN] Nombre vacío. Bloqueando acceso.');
        nameInput.focus();
        nameInput.classList.add('shake');
        setTimeout(() => nameInput.classList.remove('shake'), 500);
    }
};

/**
 * Inicia la aplicación después de que el usuario ingresa su nombre
 * @param {string} name - Nombre del usuario
 */
function startApp(name) {
    // ✅ GUARD: Validar que el nombre sea válido
    if (!name || name.trim().length < 1) {
        console.error('❌ [FATAL] startApp llamado sin nombre válido. Bloqueando.');
        hasValidatedName = false;
        return; // Prevenir acceso a la app
    }
    
    // ✅ GUARD: Validar que userName esté seteado
    if (!userName || userName.trim().length < 1) {
        console.error('❌ [FATAL] userName no está seteado. Bloqueando.');
        hasValidatedName = false;
        return; // Prevenir acceso a la app
    }
    
    // ✅ GUARD: Validar que hasValidatedName sea true
    if (!hasValidatedName) {
        console.error('❌ [FATAL] Intento de acceso sin validación. Bloqueando.');
        return; // Prevenir acceso a la app
    }
    
    console.log('✅ [ACCESO] Todas las validaciones pasadas. Accediendo a la app...');
    
    // ✅ Agregar clase unlocked para permitir interacción
    app.classList.add('unlocked');
    app.classList.remove('hidden'); // ✅ Remover clase hidden
    
    // ✅ DESAPARECER welcome completamente
    welcome.classList.add('hidden');
    welcome.style.display = 'none !important';
    welcome.style.visibility = 'hidden';
    welcome.style.opacity = '0';
    welcome.style.pointerEvents = 'none';
    welcome.style.zIndex = '-1';
    
    greetingName.textContent = name;
    
    // Agregar mensaje de bienvenida de TutorIA
    const welcomeMsg = `¡Hola ${name}! 👋 Soy TutorIA, tu tutor pedagógico. Estoy aquí para ayudarte a aprender de forma interactiva y personalizada.

¿Qué deseas aprender hoy? Cuéntame el tema y descubriremos juntos, paso a paso. 🧠`;
    addMessage(welcomeMsg, 'assistant', null, new Date().toISOString());
    
    lucide.createIcons();
    renderChatList();
}

// ======== GESTIÓN DE HISTORIAL DE CHATS ========
/**
 * Abre/cierra sidebar de historial
 */
menuBtn.onclick = () => sidebar.classList.remove('hidden');
closeSidebar.onclick = () => sidebar.classList.add('hidden');

/**
 * Crea un nuevo chat
 */
newChatBtn.onclick = () => {
    // Evitar múltiples clics rápidos
    if (newChatDebounce) return;
    newChatDebounce = true;
    
    const previousChatId = currentChatId;
    
    // 1. Crear nuevo chat PRIMERO
    currentChatId = Date.now().toString();
    chats[currentChatId] = { 
        messages: [], 
        title: 'Nuevo Chat', 
        createdAt: new Date().toISOString(),
        quizFinalized: false  // ✅ Inicializar bandera
    };
    messages = chats[currentChatId].messages;
    exchangeCount = 0;
    quizFinalized = false;  // ✅ Resetear bandera global
    send.removeAttribute('disabled');
    send.classList.remove('disabled');
    saveChats();
    renderChatList();
    renderMessages();
    sidebar.classList.add('hidden');
    
    // 2. Luego finalizar el título del chat anterior
    finalizeChatTitle(previousChatId).then(() => {
        newChatDebounce = false; // Permitir nuevos clics
    });
};

/**
 * Finaliza y guarda el título del chat actual o especificado
 * Se llama cuando se cambia de chat o se cierra uno
 * @param {string} chatIdToFinalize - ID del chat a finalizar (opcional, usa currentChatId si no se proporciona)
 */
async function finalizeChatTitle(chatIdToFinalize = null) {
    const targetChatId = chatIdToFinalize || currentChatId;
    if (!chats[targetChatId] || chats[targetChatId].title !== 'Nuevo Chat') {
        return;
    }

    const newTitle = await generateChatTitleWithAI(chats[targetChatId].messages);
    if (newTitle !== 'Nuevo Chat') {
        chats[targetChatId].title = newTitle;
        saveChats();
        renderChatList();
    }
}

/**
 * Genera un título inteligente usando la IA basado en toda la conversación
 * Máximo 10-15 palabras, descriptivo del tema
 * @param {Array} chatMessages - Mensajes del chat
 * @returns {Promise<string>} Título generado
 */
async function generateChatTitleWithAI(chatMessages) {
    try {
        if (chatMessages.length < 4) {
            return 'Nuevo Chat';
        }

        // Obtener contexto: primeros 2-3 intercambios del chat
        const contextMessages = chatMessages.slice(0, 8)
            .map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.content.substring(0, 120)}`)
            .join('\n');

        const prompt = `Eres experto en resumir temas educativos. Analiza esta conversación y genera un TÍTULO DESCRIPTIVO (10-15 palabras) que resuma el tema principal discutido.

CONVERSACIÓN:
${contextMessages}

REQUISITOS:
- 10-15 palabras máximo
- Descripción clara del TEMA (no preguntas vagas)
- Formato: "Tema: subtema" o similar
- En español
- SIN comillas ni caracteres especiales al inicio/final
- Ejemplo: "Protección de Cables en Redes: Alien Crosstalk y Blindaje Individual"

Responde SOLO con el título, nada más:`;

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getCurrentApiKey()}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    {
                        role: "system",
                        content: "Eres un generador de títulos para temas educativos. Sé conciso y descriptivo."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 50
            })
        });

        if (!res.ok) {
            console.warn('⚠️ [TITLE] Error generando título:', res.status);
            return 'Nuevo Chat';
        }

        const data = await res.json();
        let title = data.choices[0]?.message?.content?.trim() || 'Nuevo Chat';

        // Limpiar el título
        title = title
            .replace(/^["'`*\-\s]+|["'`*\-\s]+$/g, '') // Remover caracteres especiales
            .replace(/\n/g, ' ') // Remover saltos de línea
            .trim()
            .substring(0, 100); // Máximo 100 caracteres

        console.log('✅ [TITLE] Título generado:', title);
        return title.length > 0 ? title : 'Nuevo Chat';

    } catch (err) {
        console.error('❌ [TITLE] Error:', err);
        return 'Nuevo Chat';
    }
}


/**
 * Renderiza la lista de chats en el sidebar
 */
/**
 * Actualiza SOLO el título de un chat en la lista sin re-renderizar todo
 * Mucho más rápido que renderChatList()
 */
function updateChatListItemFast(chatId) {
    const chatList = document.getElementById('chatList');
    if (!chatList || !chats[chatId]) return;
    
    const chat = chats[chatId];
    // Buscar el elemento del chat en el DOM
    const chatItems = chatList.querySelectorAll('[data-chat-id]');
    chatItems.forEach(item => {
        if (item.dataset.chatId === chatId) {
            const titleEl = item.querySelector('.chat-title');
            if (titleEl) {
                titleEl.textContent = chat.title;
            }
        }
    });
}

/**
 * Renderiza la lista de chats en el sidebar
 */
function renderChatList() {
    const chatList = document.getElementById('chatList');
    chatList.innerHTML = '<button id="btnDeleteAllChats" class="w-full text-center px-4 py-3 mb-3 rounded-lg text-white font-semibold transition">🗑️ Borrar todos los chats</button>';
    Object.entries(chats).sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt)).forEach(([id, chat]) => {
        const div = document.createElement('div');
        div.className = 'chat-item flex justify-between items-center p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition';
        div.setAttribute('data-chat-id', id);
        div.innerHTML = `
            <div class="flex-1">
                <p class="font-bold truncate chat-title">${chat.title}</p>
                    <p class="text-sm opacity-70">${getExactTime(new Date(chat.createdAt))}</p>
            </div>
            <button class="deleteChat text-red-500 p-1" data-id="${id}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        `;
        div.querySelector('.deleteChat').onclick = (e) => {
            e.stopPropagation();
            pendingDeleteId = id;
            document.querySelector('.modal-title').textContent = '⚠️ Confirmar eliminación';
            document.querySelector('.modal-message').textContent = '¿Estás seguro de que deseas borrar esta conversación? Esta acción no se puede deshacer.';
            showConfirmModal();
        };
        div.onclick = () => {
            // ✅ CAMBIAR DE CHAT INMEDIATAMENTE (sin esperar finalizeChatTitle)
            const previousId = currentChatId;
            currentChatId = id;
            messages = chats[id].messages;
            exchangeCount = 0;
            
            // ✅ CARGAR ESTADO DE QUIZ FINALIZADO
            quizFinalized = chats[id].quizFinalized || false;
            console.log(`📋 [CHAT] Chat cargado. quizFinalized: ${quizFinalized}`);
            
            localStorage.setItem('tutoria_currentChatId', id);
            renderMessages();
            
            // ✅ DESHABILITAR BOTÓN ENVÍO SI QUIZ FUE FINALIZADO
            if (quizFinalized) {
                send.setAttribute('disabled', 'disabled');
                send.classList.add('disabled');
                send.classList.add('quiz-finalized');
                send.style.opacity = '0.4';
                send.style.pointerEvents = 'none';
                send.style.cursor = 'not-allowed';
                console.log('🔒 [QUIZ] Chat finalizado - Botón bloqueado permanentemente');
            } else {
                send.removeAttribute('disabled');
                send.classList.remove('disabled');
                send.classList.remove('quiz-finalized');
                send.style.opacity = '1';
                send.style.pointerEvents = 'auto';
                send.style.cursor = 'pointer';
            }
            
            sidebar.classList.add('hidden');
            
            // ✅ EJECUTAR finalizeChatTitle EN BACKGROUND (no bloquea)
            if (previousId !== id) {
                finalizeChatTitle(previousId).catch(err => console.error('Error finalizando título:', err));
            }
        };
        chatList.appendChild(div);
    });
    lucide.createIcons();
}

/**
 * Calcula tiempo exacto (HH:MM) desde una fecha
 * @param {Date} date - Fecha a convertir
 * @returns {string} Hora en formato HH:MM
 */
function getExactTime(date) {
    try {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    }
}

/**
 * Guarda todos los chats en localStorage
 */
function saveChats() {
    localStorage.setItem('tutoria_chats', JSON.stringify(chats));
    localStorage.setItem('tutoria_currentChatId', currentChatId);
}

/**
 * Renderiza la lista de chats en el sidebar
 * Incluye fecha exacta de creación y opción de eliminar
 */
function renderChatListOld() {
    chatList.innerHTML = '<button id="btnDeleteAllChats" class="w-full text-center px-4 py-3 mb-3 rounded-lg text-white font-semibold transition">🗑️ Borrar todos los chats</button>';
    Object.entries(chats).sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt)).forEach(([id, chat]) => {
        const div = document.createElement('div');
        div.className = 'chat-item flex justify-between items-center p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition';
        div.innerHTML = `
            <div class="flex-1">
                <p class="font-bold truncate">${chat.title}</p>
                    <p class="text-sm opacity-70">${getExactTime(new Date(chat.createdAt))}</p>
            </div>
            <button class="deleteChat text-red-500 p-1" data-id="${id}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        `;
        div.querySelector('.deleteChat').onclick = (e) => {
            e.stopPropagation();
            pendingDeleteId = id;
            document.querySelector('.modal-title').textContent = '⚠️ Confirmar eliminación';
            document.querySelector('.modal-message').textContent = '¿Estás seguro de que deseas borrar esta conversación? Esta acción no se puede deshacer.';
            showConfirmModal();
        };
        div.onclick = () => {
            // Finalizar el título del chat anterior antes de cambiar
            const previousId = currentChatId;
            finalizeChatTitle(previousId).then(() => {
                currentChatId = id;
                messages = chats[id].messages;
                exchangeCount = 0;
                localStorage.setItem('tutoria_currentChatId', id);
                renderMessages();
                sidebar.classList.add('hidden');
            });
        };
        chatList.appendChild(div);
    });
    lucide.createIcons();
}

// ======== RENDERIZADO DE MENSAJES ========
/**
 * Renderiza todos los mensajes del chat actual desde cache
 */
function renderMessages() {
    messagesDiv.innerHTML = '';
    if (messages.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    
    empty.classList.add('hidden');
    
    // ✅ Usar DocumentFragment para renderizar más rápido
    const fragment = document.createDocumentFragment();
    
    messages.forEach(msg => {
        // Crear elemento sin agregarlo al DOM todavía
        const div = document.createElement('div');
        div.className = `message flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`;
        
        const bubble = document.createElement('div');
        bubble.className = `max-w-[80%] px-5 py-4 rounded-3xl shadow-xl ${msg.role === 'user' ? 'msg-user' : 'msg-assistant'} border ${msg.role === 'user' ? '' : 'border-white/20'}`;
        
        if (msg.image) {
            const img = document.createElement('img');
            img.src = msg.image;
            img.className = 'rounded-lg';
            bubble.appendChild(img);
        }
        
        const textDiv = document.createElement('div');
        let parsed = marked.parse(msg.content);
        parsed = parsed.replace(/<table>/g, '<table class="table-auto w-full border-collapse border border-gray-300">')
                      .replace(/<th>/g, '<th class="border border-gray-300 px-4 py-2">')
                      .replace(/<td>/g, '<td class="border border-gray-300 px-4 py-2">');
        textDiv.innerHTML = parsed;
        bubble.appendChild(textDiv);
        
        const timeP = document.createElement('p');
        timeP.className = 'text-xs opacity-50 mt-1 text-right';
        timeP.textContent = getExactTime(new Date(msg.timestamp));
        bubble.appendChild(timeP);
        
        div.appendChild(bubble);
        fragment.appendChild(div);
    });
    
    // ✅ Agregar TODOS los elementos de una vez
    messagesDiv.appendChild(fragment);
    
    // Renderizar MathJax y Lucide después
    MathJax?.typesetPromise?.().catch(err => console.error('MathJax error:', err));
    lucide.createIcons();
    
    console.log(`📊 [CHAT] Total de mensajes en el chat: ${messages.length}`);
    scrollToBottom();
}

// ======== ENVÍO DE MENSAJES ========
/**
 * Envía un mensaje al chat y obtiene respuesta de la IA
 * Incluye soporte para imágenes, OCR local y análisis remoto
 * @param {*} userChoice - Opción del usuario (para quiz) o undefined
 */
async function sendMessage(userChoice) {
    console.log('\n\n========================================');
    console.log('🚀 [INICIO] Iniciando sendMessage()');
    console.log(`📊 [ESTADÍSTICA] Mensajes totales en el chat: ${messages.length}`);
    console.log('========================================');
    
    const inputText = input.value.trim();
    const textToSend = (typeof userChoice !== 'undefined' && userChoice !== null) ? String(userChoice) : inputText;
    
    console.log('📝 [ENTRADA] Texto del usuario:', textToSend ? textToSend.substring(0, 100) : '(VACÍO)');
    console.log('📷 [ENTRADA] ¿Hay imagen?:', selectedImage ? 'SÍ' : 'NO');
    
    if(!textToSend && !selectedImage) {
        console.log('⚠️ [VALIDACIÓN] No hay texto ni imagen. Abortando.');
        return;
    }

    // Prevenir envíos duplicados
    if (send.hasAttribute('disabled')) {
        console.log('⚠️ [VALIDACIÓN] Ya hay un envío en progreso. Ignorando.');
        return;
    }
    
    // Desactivar botón inmediatamente para evitar múltiples envíos
    send.setAttribute('disabled', '');
    send.classList.add('disabled');

    // Guardar mensaje del usuario con imagen si hay
    const messageTimestamp = new Date().toISOString();
    const imageToProcess = selectedImage; // Guardar antes de limpiar
    addMessage(textToSend, 'user', imageToProcess, messageTimestamp);
    
    // Limpiar input solo si se envió desde la caja de texto
    if (typeof userChoice === 'undefined' || userChoice === null) input.value = '';
    input.style.height = '44px'; // Resetear altura al original
    clearImagePreview(); // Limpiar UI y selectedImage
    
    // ✅ INTERCEPTAR SOLICITUDES DE QUIZ
    const inputLower = textToSend.toLowerCase();
    if ((inputLower.includes('quiz') || inputLower.includes('examen') || inputLower.includes('prueba')) && !selectedImage) {
        console.log('🎯 [QUIZ] ¡Usuario pidió quiz! Interceptando...');
        removeTyping();
        
        // Contar mensajes de IA
        const iaMessages = messages.filter(m => m.role === 'assistant');
        const iaCount = iaMessages.length;
        
        // Detectar si pide quiz final o rápido
        if (inputLower.includes('examen final') || inputLower.includes('examen completo')) {
            console.log('🎯 [QUIZ] Iniciando EXAMEN FINAL');
            
            // Verificar si hay mínimo 6 mensajes de IA
            if (iaCount < 6) {
                console.warn(`⚠️ [QUIZ] No hay suficientes mensajes de IA. Tienes ${iaCount}, necesitas 6 mínimo`);
                addMessage(`⚠️ Aún no hay suficiente contexto para el examen final. Necesito que hayamos intercambiado al menos 6 respuestas mías (tienes ${iaCount}/6). Por favor, continúa haciendo preguntas sobre el tema y luego intentamos de nuevo. 📚`, 'assistant', null, new Date().toISOString());
            } else {
                await startFinalQuiz();
            }
        } else {
            console.log('🎯 [QUIZ] Iniciando QUIZ RÁPIDO');
            
            // Verificar si hay mínimo 3 mensajes de IA
            if (iaCount < 3) {
                console.warn(`⚠️ [QUIZ] No hay suficientes mensajes de IA. Tienes ${iaCount}, necesitas 3 mínimo`);
                addMessage(`⚠️ Aún no hay suficiente contexto para un quiz. Necesito que te haya respondido al menos 3 veces (voy en ${iaCount}/3). Por favor, hazme más preguntas sobre el tema y luego intentamos de nuevo. 📝`, 'assistant', null, new Date().toISOString());
            } else {
                await startAutoQuiz();
            }
        }
        
        send.removeAttribute('disabled');
        send.classList.remove('disabled');
        updateSendState();
        return;
    }
    
    // Remover typing anterior si existe (por si acaso)
    removeTyping();
    showTyping();

    try {
        // Si hay imagen, PRIMERO intentar extraer texto con OCR
        let imageAnalysisInfo = '';
        let ocrResult = null;
        let ocrFailed = false;
        
        if (imageToProcess) {
            try {
                console.log('📸 [IMAGEN] ========================================');
                console.log('📸 [IMAGEN] Detectada imagen en el mensaje');
                console.log('📸 [IMAGEN] Iniciando análisis OCR...');
                console.log('📸 [IMAGEN] ========================================');
                
                ocrResult = await analyzeImage(imageToProcess);
                
                console.log('📸 [IMAGEN] ========================================');
                console.log('📸 [IMAGEN] Resultado completo de OCR:', ocrResult);
                console.log('📸 [IMAGEN] ========================================');
                
                // Validar si el OCR fue exitoso
                if (ocrResult && ocrResult.valid && ocrResult.text && ocrResult.text.trim().length > 5) {
                    imageAnalysisInfo = `**TEXTO EXTRAÍDO DE LA IMAGEN:**\n\n${ocrResult.text.trim()}`;
                    console.log('📸 [IMAGEN] ✅ Texto encontrado y validado');
                    console.log('📸 [IMAGEN] Longitud final:', ocrResult.text.length, 'caracteres');
                    console.log('📸 [IMAGEN] Confianza:', ocrResult.confidence);
                } else {
                    // OCR falló o texto no válido - ELIMINAR BURBUJA DEL USUARIO
                    console.log('📸 [IMAGEN] ❌ OCR falló - Texto no válido o no legible');
                    ocrFailed = true;
                    
                    // Eliminar el último mensaje (burbuja del usuario)
                    removeTyping();
                    if (messages.length > 0) {
                        messages.pop();
                        saveChats();
                    }
                    
                    // Mostrar modal de error
                    showTranscriptionErrorModal();
                    
                    // Re-activar el botón de envío
                    send.removeAttribute('disabled');
                    send.classList.remove('disabled');
                    updateSendState();
                    
                    console.log('📸 [IMAGEN] Modal de error mostrado, burbuja eliminada');
                    return;
                }
            } catch (ocrErr) {
                console.error('📸 [IMAGEN] ❌ Error en OCR:', ocrErr.message || ocrErr);
                console.warn('📸 [IMAGEN] ⚠️ Error al procesar la imagen...');
                ocrFailed = true;
                
                // Eliminar el último mensaje (burbuja del usuario)
                removeTyping();
                if (messages.length > 0) {
                    messages.pop();
                    saveChats();
                }
                
                // Mostrar modal de error
                showTranscriptionErrorModal();
                
                // Re-activar el botón de envío
                send.removeAttribute('disabled');
                send.classList.remove('disabled');
                updateSendState();
                
                return;
            }
        }

        console.log('💬 [CHAT] ========================================');
        console.log('💬 [CHAT] Preparando mensajes para OpenRouter...');
        console.log('💬 [CHAT] Texto del usuario:', textToSend);
        console.log('💬 [CHAT] Información de imagen:', imageAnalysisInfo ? imageAnalysisInfo.substring(0, 100) + '...' : 'SIN IMAGEN');
        
        // Optimizar: Contexto MÍNIMO para máxima velocidad - ULTRA RÁPIDO
        // Solo enviar: SYSTEM + (último intercambio si hay) + pregunta actual
        const recentMessages = [];
        
        // Obtener último intercambio (máx 1 mensaje anterior de IA)
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant' && i > 0 && recentMessages.length === 0) {
                recentMessages.push({ role: 'assistant', content: messages[i].content.substring(0, 200) }); // Truncar a 200 chars
                break;
            }
        }
        
        // Preparar mensajes MINIMALISTAS para OpenRouter
        const allMessages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...recentMessages,
            { 
                role: "user", 
                content: (textToSend || (imageAnalysisInfo ? "Analiza" : "")) + (imageAnalysisInfo ? `\n${imageAnalysisInfo.substring(0, 300)}` : '')
            }
        ];
        
        console.log('💬 [CHAT] Total de mensajes a enviar:', allMessages.length, '(ultra optimizado)');
        console.log('💬 [CHAT] Contenido final del usuario:', allMessages[allMessages.length - 1].content.substring(0, 300));
        console.log('💬 [CHAT] ========================================');
        
        // MOSTRAR EXACTAMENTE QUÉ SE ENVÍA A OPENROUTER
        console.log('\n🔍 [DEBUG] PAYLOAD EXACTO A OPENROUTER:');
        console.log('═══════════════════════════════════════════════════════');
        const payload = {
            model: MODEL,
            messages: allMessages,
            temperature: 0.6,
            max_tokens: 250,
            top_p: 0.8,
            frequency_penalty: 0,
            presence_penalty: 0
        };
        console.log('MODEL:', payload.model);
        console.log('TEMPERATURE:', payload.temperature);
        console.log('MAX_TOKENS:', payload.max_tokens);
        console.log('MESSAGES COUNT:', payload.messages.length);
        console.log('\n📋 MENSAJES DETALLADOS:');
        payload.messages.forEach((msg, idx) => {
            console.log(`\n[${idx}] Role: ${msg.role}`);
            console.log(`    Content (${msg.content.length} chars):`, msg.content.substring(0, 150) + '...');
        });
        console.log('\n═══════════════════════════════════════════════════════\n');

        let res = null;
        let retryCount = 0;
        const maxRetries = API_KEYS_POOL.length;

        // Intentar con múltiples API keys
        while (retryCount < maxRetries) {
            try {
                const currentKey = getCurrentApiKey();
                if (!currentKey) {
                    throw new Error('No API keys available');
                }

                const activeEmail = getCurrentEmail();
                console.log(`\n${'═'.repeat(60)}`);
                console.log(`💬 [OPENROUTER] Enviando a OpenRouter (intento ${retryCount + 1}/${maxRetries})`);
                console.log(`📧 [CORREO] ${activeEmail}`);
                console.log(`${'═'.repeat(60)}`);

                res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${currentKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": window.location.origin,
                        "X-Title": "TutorIA"
                    },
                    body: JSON.stringify({
                        model: MODEL,
                        messages: allMessages,
                        temperature: 0.5,
                        max_tokens: 250,
                        top_p: 0.9,
                        frequency_penalty: 0,
                        presence_penalty: 0
                    })
                });

                console.log(`💬 [OPENROUTER] Status de respuesta: ${res.status} ${res.statusText}`);

                // Códigos de error que indican API key inválida o problema grave
                if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 429) {
                    console.warn(`\n${'═'.repeat(60)}`);
                    console.warn(`❌ [ERROR ${res.status}] API key inválida o cuota excedida`);
                    console.warn(`❌ [CORREO FALLIDO] ${getCurrentEmail()}`);
                    console.warn(`${'═'.repeat(60)}\n`);
                    console.warn(`🔄 Invalidando y rotando a siguiente API...`);
                    invalidateCurrentKey(res.status);
                    
                    // Intentar con la siguiente key
                    if (API_KEYS_POOL.length > 0) {
                        retryCount++;
                        continue; // Reintentar con la siguiente key
                    } else {
                        throw new Error(`All API keys invalid (Error ${res.status})`);
                    }
                } else if (!res.ok) {
                    // Otros errores (500, etc) - intentar una vez más
                    console.warn(`⚠️ [OPENROUTER] Error temporal (${res.status}). Reintentando...`);
                    retryCount++;
                    continue;
                } else {
                    // Éxito
                    console.log('✅ [OPENROUTER] Conexión exitosa');
                    break;
                }
            } catch (fetchErr) {
                console.error('❌ [OPENROUTER] Error en fetch:', fetchErr.message);
                retryCount++;
                if (retryCount >= maxRetries) {
                    throw fetchErr;
                }
                console.log(`⏱️ [OPENROUTER] Reintentando en 1 segundo...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de reintentar
            }
        }

        if (!res || !res.ok) {
            console.error('❌ [OPENROUTER] Error en respuesta final:', res?.status, res?.statusText);
            throw new Error(`API error: ${res?.status || 'unknown'}`);
        }

        const data = await res.json();
        const reply = data.choices[0]?.message?.content || "Lo siento, hubo un error. Intenta de nuevo.";

        console.log('✅ [OPENROUTER] Respuesta recibida exitosamente');
        console.log('✅ [OPENROUTER] Longitud de respuesta:', reply.length, 'caracteres');
        console.log('✅ [OPENROUTER] Primeros 200 caracteres:', reply.substring(0, 200));
        console.log('💬 [CHAT] ========================================');

        removeTyping();
        addMessage(reply, 'assistant', null, new Date().toISOString());
        
        console.log('✅ [CHAT] Mensaje de IA añadido al chat');
        console.log(`📊 [INTERCAMBIOS] Total: ${exchangeCount + 1}`);
        
        // Incrementar contador de intercambios cuando es respuesta de IA
        exchangeCount++;
        
        // ✅ AUTO-GENERAR TÍTULO EN EL 3ER MENSAJE DE IA
        if (exchangeCount === 3 && chats[currentChatId].title === 'Nuevo Chat') {
            console.log('✨ [TÍTULO] Generando título automático en 3er intercambio...');
            generateChatTitleWithAI(messages).then(newTitle => {
                if (newTitle && newTitle !== 'Nuevo Chat') {
                    chats[currentChatId].title = newTitle;
                    saveChats();
                    // Actualizar SOLO el item del chat actual en la lista (sin re-renderizar todo)
                    updateChatListItemFast(currentChatId);
                    console.log('✅ [TÍTULO] Actualizado:', newTitle);
                }
            }).catch(err => console.error('❌ [TÍTULO] Error:', err));
        }
        
        // Resetear flag de quiz options
        isShowingQuizOptions = false;
        
        // ✅ LÓGICA AUTOMÁTICA DE QUIZES (SIN INTERVENCIÓN DEL USUARIO)
        // Quiz Rápido: Exactamente a los 4 mensajes de IA
        if (exchangeCount === 4 && !isInQuizMode && !quizFinalized) {
            console.log('🎯 [QUIZ RÁPIDO] ¡Momento para el quiz rápido! (msg 4)');
            isShowingQuizOptions = true;
            setTimeout(() => {
                startAutoQuiz();
            }, 1000);
        }
        // Quiz Final: Exactamente a los 8 mensajes de IA (4 después del quiz rápido)
        else if (exchangeCount === 8 && !isInQuizMode && !quizFinalized) {
            console.log('🎯 [QUIZ FINAL] ¡Momento para el quiz final! (msg 8)');
            isShowingQuizOptions = true;
            setTimeout(() => {
                startFinalQuiz();
            }, 1000);
        }
        else if (exchangeCount >= 2 && !isInQuizMode) {
            console.log(`📝 [CHAT] Intercambio ${exchangeCount} completado. Esperando siguiente pregunta...`);
        }
        
        // ✅ NUEVA LÓGICA: Después de 7 mensajes de IA, ofrecer quiz final o explicación
        if (exchangeCount === 7 && !isInQuizMode && !isShowingQuizOptions && !quizFinalized) {
            console.log('🎯 [QUIZ FINAL] ¡Momento para el quiz definitivo!');
            // Ya no ofrecemos opciones, vamos directo al quiz
            isShowingQuizOptions = true;
            setTimeout(() => {
                startFinalQuiz();
            }, 1000);
        }
        
        // Si estamos en modo explicación y dice "Listo"
        if (isInQuizMode && inputText.toLowerCase().trim() === 'listo') {
            // La explicación ya fue guardada como mensaje
            gradeExplanation(messages[messages.length - 2]?.content || inputText);
        }

    } catch(err) {
        console.error('❌ [ERROR FATAL]:', err.message || err);
        console.error('❌ [ERROR STACK]:', err.stack);
        removeTyping();
        
        // Mostrar error amable al usuario en el chat
        let errorMsg = "❌ Hubo un error procesando tu mensaje. ";
        if (err.message.includes('API') || err.message.includes('network')) {
            errorMsg += "Estamos presentando fallos, intenta de nuevo en unos breves minutos :D";
        } else if (err.message.includes('OCR')) {
            errorMsg += "Error en el reconocimiento de imagen. Intenta con otra imagen.";
        } else {
            errorMsg += "Por favor, intenta de nuevo.";
        }
        
        addMessage(errorMsg, 'assistant', null, new Date().toISOString());
    } finally {
        // SIEMPRE re-activar el botón al final
        send.removeAttribute('disabled');
        send.classList.remove('disabled');
        updateSendState();
        console.log('✅ [FINAL] sendMessage() completado');
    }
}

// ======== ADICIÓN Y RENDERIZADO DE MENSAJES ========
/**
 * Agrega un mensaje al chat con soporte para Markdown y MathJax
 * Detecta automáticamente formato de quiz
 * @param {string} text - Contenido del mensaje
 * @param {string} sender - 'user' o 'assistant'
 * @param {string} image - URL de imagen base64 (opcional)
 * @param {string} timestamp - Timestamp ISO del mensaje
 * @param {boolean} save - Si guardar en localStorage (default: true)
 */
function addMessage(text, sender, image = null, timestamp = new Date().toISOString(), save = true) {
    empty.classList.add('hidden');
    const div = document.createElement('div');
    div.className = `message flex ${sender === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`;
    
    const bubble = document.createElement('div');
    bubble.className = `max-w-[80%] px-5 py-4 rounded-3xl shadow-xl ${sender === 'user' ? 'msg-user' : 'msg-assistant'} border ${sender === 'user' ? '' : 'border-white/20'}`;
    
    // Agregar imagen si hay
    if (image) {
        const img = document.createElement('img');
        img.src = image;
        img.className = 'rounded-lg';
        bubble.appendChild(img);
    }

    // Parsear Markdown con soporte para tablas
    let parsed = marked.parse(text);
    parsed = parsed.replace(/<table>/g, '<table class="table-auto w-full border-collapse border border-gray-300">')
                  .replace(/<th>/g, '<th class="border border-gray-300 px-4 py-2">')
                  .replace(/<td>/g, '<td class="border border-gray-300 px-4 py-2">');

    const textDiv = document.createElement('div');
    textDiv.innerHTML = parsed;
    bubble.appendChild(textDiv);

    // Agregar timestamp
    const timeP = document.createElement('p');
    timeP.className = 'text-xs opacity-50 mt-1 text-right';
    const tsDate = new Date(timestamp);
    timeP.textContent = getExactTime(tsDate);
    bubble.appendChild(timeP);

    // Detectar si es quiz y renderizar opciones
    if (sender === 'assistant' && text.startsWith('Quiz:')) {
        isQuizMode = true;
        lastQuiz = text;
        renderQuiz(bubble, text);
    }

    div.appendChild(bubble);
    messagesDiv.appendChild(div);

    // Guardar en mensaje si se solicita
    if (save) {
        messages.push({ content: text, role: sender, image: image || null, timestamp: timestamp, imageAnalysis: null });
        saveChats();
    }

    scrollToBottom();
}

// ======== RENDERIZADO DE QUIZ ========
/**
 * Renderiza un quiz con opciones de radio button y botón para enviar
 * Detecta automáticamente del formato "Quiz: ..." y líneas con "- "
 * @param {HTMLElement} bubble - Elemento bubble donde renderizar
 * @param {string} text - Texto del quiz en formato
 */
function renderQuiz(bubble, text) {
    const lines = text.split('\n');
    const title = lines[0] || 'Quiz';
    const options = lines.slice(1).filter(l => l.trim().startsWith('- '));

    const container = document.createElement('div');
    const titleP = document.createElement('p');
    titleP.className = 'font-bold mb-2';
    titleP.textContent = title;
    container.appendChild(titleP);

    options.forEach((opt, index) => {
        const letter = ['a', 'b', 'c', 'd'][index] || String(index + 1);
        const label = document.createElement('label');
        label.className = 'flex items-center gap-2 mb-2 cursor-pointer';
        label.htmlFor = `quiz_opt_${index}`;

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'quiz';
        input.value = letter;
        input.id = `quiz_opt_${index}`;
        input.className = 'quiz-option w-5 h-5';

        const span = document.createElement('span');
        span.innerHTML = opt;

        label.appendChild(input);
        label.appendChild(span);
        container.appendChild(label);
    });

    // Botón para enviar respuesta
    const submitBtn = document.createElement('button');
    submitBtn.id = 'submitQuiz';
    submitBtn.disabled = true;
    submitBtn.className = 'mt-4 px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold transition';
    submitBtn.textContent = 'Enviar respuesta';
    container.appendChild(submitBtn);

    const target = bubble.querySelector('div');
    if (target) {
        target.innerHTML = '';
        target.appendChild(container);
    }

    // Habilitar botón cuando se selecciona una opción
    const radios = container.querySelectorAll('input[name="quiz"]');
    radios.forEach(r => r.addEventListener('change', () => {
        submitBtn.disabled = false;
        submitBtn.classList.add('quiz-glow-dark', 'quiz-glow-light');
    }));

    // Event listener para enviar respuesta
    submitBtn.addEventListener('click', () => {
        const selected = container.querySelector('input[name="quiz"]:checked');
        if (selected) {
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
            submitBtn.classList.remove('quiz-glow-dark', 'quiz-glow-light');
            sendMessage(selected.value);
            isQuizMode = false;
        } else {
            alert('Selecciona una opción primero');
        }
    });
}

/**
 * Muestra animación de tipeo mientras el asistente genera respuesta
 */
function showTyping() {
    const div = document.createElement('div');
    div.id = 'typing';
    div.className = 'message flex justify-start animate-slide-up';
    div.innerHTML = `
        <div class="px-5 py-4 rounded-3xl msg-assistant border border-white/20">
            <div class="typing">
                <span></span><span></span><span></span>
            </div>
        </div>`;
    messagesDiv.appendChild(div);
    scrollToBottom();
}

/**
 * Elimina la animación de tipeo
 */
function removeTyping() {
    const typing = document.getElementById('typing');
    if(typing) typing.remove();
}

/**
 * Desplaza el área de mensajes al final
 */
function scrollToBottom() {
    // Usar requestAnimationFrame para mejor rendimiento
    requestAnimationFrame(() => {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}

// ======== GESTIÓN DE IMÁGENES ========
const mediaMenu = document.getElementById('mediaMenu');

/**
 * Abre/cierra menú de adjuntos
 */
scanBtn.onclick = (e) => {
    e.stopPropagation();
    mediaMenu.classList.toggle('hidden');
};

/**
 * Cierra menú de adjuntos al hacer clic fuera
 */
document.addEventListener('click', (e) => {
    if (!mediaMenu.contains(e.target) && e.target !== scanBtn) {
        mediaMenu.classList.add('hidden');
    }
});

/**
 * Muestra modal de advertencia antes de seleccionar foto
 */
function showOCRWarningModal() {
    const div = document.createElement('div');
    div.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center';
    
    // Detectar si está en modo claro
    const isLightMode = document.body.classList.contains('light-theme');
    const bgClass = isLightMode 
        ? 'bg-gradient-to-br from-blue-100 to-indigo-100 border-indigo-300' 
        : 'bg-gradient-to-br from-indigo-900 to-purple-900 border-purple-500/50';
    const titleClass = isLightMode ? 'text-indigo-900' : 'text-white';
    const textClass = isLightMode ? 'text-indigo-800/80' : 'text-white/80';
    const warningClass = isLightMode ? 'text-amber-700 bg-amber-50 px-3 py-2 rounded-lg' : 'text-yellow-300';
    
    div.innerHTML = `
        <div class="rounded-2xl p-6 max-w-sm border shadow-2xl ${bgClass}">
            <p class="${titleClass} text-xl font-bold mb-3">📸 Seleccionar Foto</p>
            <p class="${textClass} mb-4 text-base leading-relaxed">
                Esta función reconoce <strong>texto en imágenes</strong>. Solo funcionará si la foto contiene texto legible (documentos, pizarras, libros, etc.).
            </p>
            <p class="${warningClass} text-sm mb-4 font-semibold">
                ⚠️ Si la foto no tiene texto o el texto no es legible, la transcripción fallará.
            </p>
            <p class="${textClass} text-sm mb-6 opacity-75">
                ⏱️ La transcripción puede demorar 10-15 segundos. Por favor, espera pacientemente.
            </p>
            <div class="flex gap-3 justify-end">
                <button id="cancelOCRModal" class="px-4 py-3 rounded-lg transition font-medium text-base ${isLightMode ? 'bg-gray-200 hover:bg-gray-300 text-gray-800' : 'bg-white/10 hover:bg-white/20 text-white'}">
                    Cancelar
                </button>
                <button id="continueOCRModal" class="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition font-medium text-base">
                    Continuar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
    
    // Event listeners para los botones
    document.getElementById('cancelOCRModal').addEventListener('click', () => {
        div.remove();
    });
    
    document.getElementById('continueOCRModal').addEventListener('click', () => {
        div.remove();
        proceedToGallery();
    });
}

/**
 * Función para proceder a la galería después del modal
 */
function proceedToGallery() {
    imageInput.click();
}

/**
 * Maneja opciones del menú (Galería)
 */
document.querySelectorAll('.media-option').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
        const action = btn.dataset.action;
        mediaMenu.classList.add('hidden');
        if (action === 'gallery') {
            showOCRWarningModal();
        }
    });
});

/**
 * Configura event listener para input de imágenes
 * @param {HTMLInputElement} fileInput - Input file element
 */
function handleImageInput(fileInput) {
    fileInput.onchange = e => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = ev => {
                selectedImage = ev.target.result;
                // Mostrar nombre del archivo
                const fileName = document.getElementById('fileName');
                if (fileName) {
                    fileName.textContent = `📷 ${file.name}`;
                }
                imagePreview.classList.remove('hidden');
                updateSendState();
            };
            reader.readAsDataURL(file);
        }
    };
}

handleImageInput(imageInput);

/**
 * Elimina la vista previa de imagen
 */
function clearImagePreview() {
    selectedImage = null;
    imagePreview.classList.add('hidden');
    imageInput.value = ''; // Limpiar el input file también
    updateSendState();
}

removeImage.onclick = clearImagePreview;

// ======== ANÁLISIS DE IMÁGENES ========
/**
 * Valida si el texto extraído tiene sentido
 * Comprueba si contiene palabras mínimas y no es solo caracteres aleatorios
 * @param {string} text - Texto a validar
 * @returns {boolean} true si el texto parece válido
 */
function isTextValid(text) {
    if (!text || text.length < 5) return false;
    
    // Contar palabras (secuencias de caracteres separadas por espacios)
    const words = text.trim().split(/\s+/).filter(w => w.length > 1);
    if (words.length < 2) return false;
    
    // Si la mayoría de líneas tienen menos de 2 caracteres, probablemente sea ruido
    const lines = text.split('\n');
    const validLines = lines.filter(l => l.trim().length > 2).length;
    if (validLines === 0) return false;
    
    // Verificar que tenga al menos 30% de caracteres alfanuméricos
    const alphanumeric = text.match(/[a-záéíóúñA-ZÁÉÍÓÚÑ0-9]/g) || [];
    const alphanumericRatio = alphanumeric.length / text.length;
    
    return alphanumericRatio > 0.3 && words.length >= 2;
}

/**
 * Muestra modal de error de transcripción
 */
function showTranscriptionErrorModal() {
    const div = document.createElement('div');
    div.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center';
    
    // Detectar si está en modo claro
    const isLightMode = document.body.classList.contains('light-theme');
    const bgClass = isLightMode 
        ? 'bg-gradient-to-br from-red-100 to-pink-100 border-red-300' 
        : 'bg-gradient-to-br from-red-900 to-pink-900 border-red-500/50';
    const titleClass = isLightMode ? 'text-red-900' : 'text-white';
    const textClass = isLightMode ? 'text-red-800/80' : 'text-white/80';
    const hintClass = isLightMode ? 'text-amber-800 bg-amber-50 px-3 py-2 rounded-lg' : 'text-yellow-300';
    
    div.innerHTML = `
        <div class="rounded-2xl p-6 max-w-sm border shadow-2xl ${bgClass}">
            <p class="${titleClass} text-xl font-bold mb-3">❌ Error de Transcripción</p>
            <p class="${textClass} mb-6 text-base leading-relaxed">
                La foto que subiste no contiene texto legible o el texto no se pudo transcribir correctamente.
            </p>
            <p class="${hintClass} text-sm mb-6 font-semibold">
                💡 Intenta con:<br>• Una foto de mejor calidad<br>• Texto más grande o legible<br>• Otra imagen
            </p>
            <div class="flex gap-3 justify-end">
                <button id="closeErrorModal" class="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition font-medium text-base">
                    Aceptar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
    
    // Event listener para el botón
    document.getElementById('closeErrorModal').addEventListener('click', () => {
        div.remove();
    });
}

/**
 * Analiza imagen usando Tesseract.js (OCR local)
 * Extrae TEXTO de la imagen con reconocimiento español
 * @param {string} imageData - Imagen en formato data URL
 * @returns {Promise<{text: string, valid: boolean}>} Objeto con texto extraído y validez
 */
/**
 * Comprime imagen para OCR más rápido
 * @param {string} dataUrl - Imagen en formato data URL
 * @returns {Promise<string>} Imagen comprimida en data URL
 */
async function compressImage(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Dimensión máxima para OCR: 1200x1200
            let width = img.width;
            let height = img.height;
            const maxDim = 1200;
            
            if (width > maxDim || height > maxDim) {
                const ratio = Math.min(maxDim / width, maxDim / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Comprimir a JPEG 75% calidad
            const compressed = canvas.toDataURL('image/jpeg', 0.75);
            resolve(compressed);
        };
        img.src = dataUrl;
    });
}

/**
 * Analiza imagen usando Tesseract.js OCR (LOCAL, ULTRA RÁPIDO)
 * @param {string} imageData - Imagen en formato data URL base64
 * @returns {Promise<{text, confidence, rawText, valid}>} Resultado del OCR
 */
async function analyzeImage(imageData) {
    try {
        console.log('🔍 [OCR] ========================================');
        console.log('🔍 [OCR] Comprimiendo imagen para OCR...');
        
        // Comprimir imagen primero (CRÍTICO PARA VELOCIDAD)
        const compressedImage = await compressImage(imageData);
        
        console.log('🔍 [OCR] Iniciando Tesseract.js OCR');
        console.log('🔍 [OCR] ========================================');
        
        const worker = await Tesseract.createWorker('spa', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    const progress = Math.round(m.progress * 100);
                    console.log(`📊 Progreso OCR: ${progress}%`);
                }
            }
        });

        console.log('🔍 [OCR] 🚀 RECONOCIENDO TEXTO...');
        const { data: { text } } = await worker.recognize(compressedImage);
        
        await worker.terminate();

        const cleanText = text.trim();

        console.log('\n═══════════════════════════════════════════════════════');
        console.log('✅ [OCR] ¡RECONOCIMIENTO COMPLETADO!');
        console.log('═══════════════════════════════════════════════════════');
        console.log('📝 Caracteres extraídos:', cleanText.length);
        console.log('─────────────────────────────────────────────────────────');
        console.log('📄 TEXTO EXTRAÍDO:');
        console.log('─────────────────────────────────────────────────────────');
        console.log(cleanText);
        console.log('═══════════════════════════════════════════════════════\n');

        // Validar si el texto tiene sentido
        const isValid = isTextValid(cleanText);
        console.log('✔️ [OCR] Validación de texto:', isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO');
        
        if (isValid) {
            return { text: cleanText, confidence: 100, rawText: cleanText, valid: true };
        }

        console.warn('⚠️ [OCR] Texto no válido o no legible');
        return { text: '', confidence: 0, rawText: '', valid: false };

    } catch (err) {
        console.error('❌ [OCR] ERROR:', err.message);
        console.error('❌ [OCR] Stack:', err.stack);
        return { text: '', confidence: 0, rawText: '', valid: false };
    }
}

/**
 * Analiza imagen usando OpenAI GPT-4 Vision API
 * LA IA VE LA IMAGEN DE VERDAD Y RESPONDE DIRECTAMENTE
 * @param {string} dataUrl - Imagen en formato data URL base64
 * @param {string} userQuestion - Pregunta del usuario sobre la imagen
 * @returns {Promise<{description: string}>} Análisis completo de la imagen
 */
async function remoteDescribeImage(dataUrl, userQuestion = "") {
    try {
        console.log('🖼️ [IMAGEN] Iniciando análisis con OpenAI GPT-4 Vision...');
        console.log('🖼️ [IMAGEN] URL de imagen (primeros 100 chars):', dataUrl.substring(0, 100));
        
        // Extraer base64 del data URL
        const base64Data = dataUrl.split(',')[1];
        const mimeType = dataUrl.includes('png') ? 'image/png' : 'image/jpeg';
        
        console.log('🖼️ [IMAGEN] Formato: ' + mimeType);
        console.log('🖼️ [IMAGEN] Tamaño base64: ' + base64Data.length + ' caracteres');

        const prompt = userQuestion || `Analiza COMPLETAMENTE esta imagen como pedagogo experto. Responde DETALLADAMENTE:

1. ¿TIPO EXACTO? (¿Es FOTO real? ¿DIBUJO? ¿DIAGRAMA? ¿ILUSTRACIÓN? ¿GRÁFICO? ¿OTRA COSA?) - Explica POR QUÉ lo crees
2. ¿QUÉ VES? Describe TODO con detalle: objetos, personas, colores, composición, luz, profundidad
3. ¿RAZONAMIENTO TÉCNICO? ¿Cómo sabes si es real o dibujado? (análisis de texturas, luz, proporciones, realismo)
4. ¿TEXTO VISIBLE? Si hay texto, transcribe EXACTAMENTE todo lo que ves escrito
5. ¿CONCEPTO EDUCATIVO? ¿Qué tema/asignatura? ¿Qué enseña? ¿En qué contexto se usa?
6. ¿ESTRATEGIA PEDAGÓGICA? ¿Cómo usarla en clase específicamente?

Sé muy detallado y pedagógico. Responde en español. Analiza COMPLETAMENTE sin limitar tu respuesta.`;

        console.log('🖼️ [IMAGEN] Enviando a OpenAI GPT-4 Vision...');

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4-turbo",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: prompt
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: dataUrl,
                                    detail: "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 2000,
                temperature: 0.5
            })
        });

        console.log('🖼️ [IMAGEN] Respuesta OpenAI status:', response.status);

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ [IMAGEN] Error OpenAI:', errorData);
            return { description: `Error: ${errorData.error?.message || 'Error desconocido'}` };
        }

        const data = await response.json();
        const analysis = data.choices?.[0]?.message?.content || '';
        
        console.log('✅ [IMAGEN] Análisis recibido exitosamente');
        console.log('✅ [IMAGEN] Longitud de análisis:', analysis.length, 'caracteres');
        console.log('✅ [IMAGEN] Primeras 200 caracteres:', analysis.substring(0, 200));

        return { description: analysis };
    } catch (err) {
        console.error('❌ [IMAGEN] Error completo:', err);
        return { description: `Error al analizar imagen: ${err.message}` };
    }
}

// ======== EVENTOS DE INPUT ========
/**
 * Actualiza estado del botón enviar según si hay texto o imagen
 */
function updateSendState() {
    const hasText = input.value.trim().length > 0;
    const hasImage = !!selectedImage;
    
    // Si estamos en modo quiz, desactivar siempre
    if (isInQuizMode) {
        send.setAttribute('disabled', '');
        send.classList.add('disabled');
        return;
    }
    
    if (hasText || hasImage) {
        send.removeAttribute('disabled');
        send.classList.remove('disabled');
    } else {
        send.setAttribute('disabled', '');
        send.classList.add('disabled');
    }
}

/**
 * Event listener para botón enviar
 */
send.onclick = () => {
    if (send.hasAttribute('disabled')) return;
    sendMessage();
};

/**
 * Permite Shift+Enter para salto de línea, Enter normal para enviar
 */
input.addEventListener('keydown', e => {
    if(e.key === 'Enter') {
        if (e.shiftKey) {
            // Shift+Enter: salto de línea
            e.preventDefault();
            const start = input.selectionStart;
            const end = input.selectionEnd;
            input.value = input.value.substring(0, start) + '\n' + input.value.substring(end);
            input.selectionStart = input.selectionEnd = start + 1;
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 128) + 'px';
            updateSendState();
        } else {
            // Enter normal: enviar
            e.preventDefault();
            if (!send.hasAttribute('disabled')) {
                sendMessage();
            }
        }
    }
});

/**
 * Actualiza estado de botón al escribir en input
 */
input.addEventListener('input', () => { 
    // Auto-grow textarea
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 128) + 'px';
    
    scrollToBottom(); 
    updateSendState(); 
});

// Inicializar estado de botón enviar
updateSendState();

// ======== INICIALIZACIÓN GENERAL ========
lucide.createIcons();

// Prevenir zoom por gestos en mobile (iOS Safari)
try {
    document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
} catch (e) {}

/**
 * Establece avatar fijo desde archivo local
 */
(function setFixedAvatar() {
    const avatarImg = document.getElementById('avatarImg');
    const avatarIcon = document.getElementById('avatarIcon');
    try {
        if (avatarImg) {
            const imgUrl = './tutoria_icono.jpg';
            avatarImg.src = imgUrl;
            avatarImg.onerror = () => {
                avatarImg.classList.add('hidden');
                if (avatarIcon) avatarIcon.classList.remove('hidden');
            };
            avatarImg.classList.remove('hidden');
        }
        if (avatarIcon) avatarIcon.classList.add('hidden');
    } catch (err) { console.warn('Could not set fixed avatar', err); }
})();

// ======== GESTIÓN DE QUIZ AUTOMÁTICO ========

/**
 * Genera un quiz automático basado en el contexto REAL de la conversación
 * @param {string} topic - Tema del quiz
 * @returns {Promise<Array>} Array de 2 objetos quiz basados en la conversación
 */
async function generateAutoQuiz(topic) {
    try {
        console.log('🎯 [QUIZ] Generando quiz automático');
        
        // ✅ USAR LOS ÚLTIMOS 3 MENSAJES DE IA COMO CONTEXTO
        // Filtrar SOLO mensajes de la IA
        const iaMessages = messages.filter(m => m.role === 'assistant');
        const lastThreeMessages = iaMessages.slice(-3);
        
        // Construir contexto SOLO con los últimos mensajes de IA
        const directContext = lastThreeMessages
            .map((m, idx) => `[Mensaje IA ${idx + 1}]: ${m.content.substring(0, 300)}`)
            .join('\n\n');
        
        if (!directContext || directContext.length < 50) {
            console.warn('⚠️ [QUIZ] Contexto insuficiente');
            return { error: true, message: 'No hay suficiente contexto para generar el quiz. Continúa conversando un poco más.' };
        }
        
        const quizPrompt = `Eres un profesor experto pedagógico. 

El estudiante ha estado aprendiendo sobre un tema. Basándote EXACTAMENTE en lo que se enseñó en estos últimos 3 mensajes, 
genera EXACTAMENTE 2 preguntas de opción múltiple que verifiquen la comprensión de lo ESPECÍFICAMENTE DISCUTIDO:

CONTEXTO DE LA LECCIÓN (últimos 3 mensajes del tutor):
${directContext}

⚠️ REGLAS CRÍTICAS - DEBES SEGUIR EXACTAMENTE:
1. ✅ Generar SOLO 2 preguntas (QUIZ 1 y QUIZ 2)
2. ✅ VERIFICAR que AMBAS preguntas sean sobre contenido mencionado EXACTAMENTE en los mensajes arriba
3. ✅ Las preguntas deben reflejar LO QUE SE ENSEÑÓ, no conceptos genéricos
4. ✅ NO hacer preguntas sobre conceptos que NO se mencionaron

ESPECIFICACIONES:
- Preguntas ESPECÍFICAS basadas en conceptos mencionados en los mensajes
- Opciones incorrectas deben ser ENGAÑOSAS pero relacionadas (errores comunes)
- EXACTAMENTE 4 opciones por pregunta (a, b, c, d)
- Las opciones deben mostrarse como: a) [texto]

Formato EXACTO (SOLO ESTO):
QUIZ 1:
Pregunta: [pregunta específica sobre lo enseñado]
a) [opción engañosa]
b) [RESPUESTA CORRECTA - directa de la lección]
c) [opción engañosa]
d) [opción engañosa]
Respuesta: b

QUIZ 2:
Pregunta: [otra pregunta específica]
a) [RESPUESTA CORRECTA]
b) [opción engañosa]
c) [opción engañosa]
d) [opción engañosa]
Respuesta: a

⛔ Si NO puedes hacer 2 preguntas relacionadas con lo enseñado, responde SOLO: "ERROR_TOPIC_MISMATCH"

Responde SOLO en el formato exacto especificado.`;

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getCurrentApiKey()}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { 
                        role: "system", 
                        content: "Eres un profesor pedagógico experto que crea preguntas específicas basadas en conversaciones reales. Creas quices que evalúan comprensión real, no memorización genérica."
                    },
                    { 
                        role: "user", 
                        content: quizPrompt 
                    }
                ],
                temperature: 0.6,
                max_tokens: 500
            })
        });

        if (!res.ok) {
            console.error('❌ [QUIZ] Error generando quiz:', res.status);
            return [];
        }

        const data = await res.json();
        const quizText = data.choices[0]?.message?.content || '';
        console.log('📝 [QUIZ] Respuesta IA COMPLETA:', quizText);
        console.log('📝 [QUIZ] Respuesta IA (primeros 200):', quizText.substring(0, 200));
        
        // ✅ VALIDACIÓN: Verificar si hay relación de tema
        if (quizText.includes('ERROR_TOPIC_MISMATCH')) {
            console.warn('⚠️ [QUIZ] Las preguntas no están relacionadas con el tema:', topic);
            return { error: true, message: `Las preguntas no están directamente relacionadas con "${topic}". Por favor, proporciona un tema más específico o continúa la conversación primero.` };
        }
        
        // Parsear las 2 preguntas del formato EXACTO
        const quizzes = [];
        const quizMatches = quizText.match(/QUIZ \d+:([\s\S]*?)(?=QUIZ \d+:|$)/g);
        
        if (!quizMatches) {
            console.warn('⚠️ [QUIZ] No se pudieron parsear los quices');
            return [];
        }

        quizMatches.forEach((quizBlock, quizIdx) => {
            const preguntaMatch = quizBlock.match(/Pregunta:\s*([^\n]+)/);
            const respuestaMatch = quizBlock.match(/Respuesta:\s*([a-d])/);
            // Mejorado: captura opciones correctamente
            const optionsMatches = quizBlock.match(/([a-d])\)\s*([^\n]+)/g);
            
            console.log(`📝 [QUIZ] Quiz ${quizIdx + 1} - Opciones encontradas:`, optionsMatches ? optionsMatches.length : 0);
            
            if (preguntaMatch && respuestaMatch && optionsMatches && optionsMatches.length >= 4) {
                const options = {};
                optionsMatches.forEach((opt, optIdx) => {
                    const parts = opt.split(')');
                    const letter = parts[0].trim();
                    const text = parts.slice(1).join(')').trim();
                    options[letter] = text;
                    console.log(`   ${letter}) ${text}`);
                });
                
                quizzes.push({
                    question: preguntaMatch[1].trim(),
                    options: options,
                    correctAnswer: respuestaMatch[1]
                });
                console.log(`✅ Quiz ${quizIdx + 1} parseado correctamente`);
            } else {
                console.warn(`⚠️ [QUIZ] Quiz ${quizIdx + 1} no cumple requisitos:`, {
                    preguntaMatch: !!preguntaMatch,
                    respuestaMatch: !!respuestaMatch,
                    optionsMatches: optionsMatches ? optionsMatches.length : 0
                });
            }
        });

        console.log('✅ [QUIZ] Quiz generados:', quizzes.length, 'sobre:', topic);
        console.log('📋 [QUIZ] Quizes finales:', JSON.stringify(quizzes, null, 2));
        return quizzes.slice(0, 2); // Máximo 2 quices
        
    } catch(err) {
        console.error('❌ [QUIZ] Error:', err);
        return [];
    }
}

/**
 * Genera un Quiz Final completo (5 preguntas)
 * Se llama cuando el usuario quiere un examen más profundo
 * @param {string} topic - Tema del quiz
 * @returns {Promise<Array>} Array de 5 preguntas
 */
async function generateFinalQuiz(topic) {
    try {
        console.log('🎯 [QUIZ FINAL] Generando quiz final completo');
        
        // ✅ USAR LOS ÚLTIMOS 6 MENSAJES DE IA COMO CONTEXTO
        // Filtrar SOLO mensajes de la IA
        const iaMessages = messages.filter(m => m.role === 'assistant');
        const lastSixMessages = iaMessages.slice(-6);
        
        // Construir contexto SOLO con los últimos mensajes de IA
        const directContext = lastSixMessages
            .map((m, idx) => `[Mensaje IA ${idx + 1}]: ${m.content.substring(0, 400)}`)
            .join('\n\n');
        
        if (!directContext || directContext.length < 100) {
            console.warn('⚠️ [QUIZ FINAL] Contexto insuficiente');
            return { error: true, message: 'No hay suficiente contexto para generar el examen. Continúa conversando un poco más.' };
        }
        
        const quizPrompt = `Eres un profesor experto pedagógico. 

El estudiante ha estado aprendiendo sobre un tema. Basándote EXACTAMENTE en lo que se enseñó en estos últimos 6 mensajes,
genera EXACTAMENTE 5 preguntas de opción múltiple que verifiquen la comprensión PROFUNDA de lo ESPECÍFICAMENTE DISCUTIDO:

CONTEXTO DE LA LECCIÓN (últimos 6 mensajes del tutor):
${directContext}

⚠️ REGLAS CRÍTICAS - DEBES SEGUIR EXACTAMENTE:
1. ✅ Generar SOLO 5 preguntas (QUIZ 1 a QUIZ 5) - NO MÁS
2. ✅ VERIFICAR que TODAS las preguntas sean sobre contenido mencionado EXACTAMENTE en los mensajes arriba
3. ✅ Las preguntas deben reflejar LO QUE SE ENSEÑÓ, no conceptos genéricos
4. ✅ NO hacer preguntas sobre conceptos que NO se mencionaron
5. ✅ Progresión: Pregunta 1-2 básicas, Pregunta 3-4 intermedias, Pregunta 5 avanzada

ESPECIFICACIONES:
- Preguntas ESPECÍFICAS basadas en conceptos mencionados en los mensajes
- Opciones incorrectas deben ser ENGAÑOSAS pero relacionadas (errores comunes)
- EXACTAMENTE 4 opciones por pregunta (a, b, c, d)
- Las opciones deben mostrarse como: a) [texto]

Formato EXACTO (SOLO ESTO):
QUIZ 1:
Pregunta: [pregunta específica sobre lo enseñado]
a) [opción engañosa]
b) [RESPUESTA CORRECTA]
c) [opción engañosa]
d) [opción engañosa]
Respuesta: b

QUIZ 2:
Pregunta: [pregunta específica]
a) [opción engañosa]
b) [opción engañosa]
c) [RESPUESTA CORRECTA]
d) [opción engañosa]
Respuesta: c

[Continuar QUIZ 3, QUIZ 4, QUIZ 5 con mismo formato]

⛔ Si NO puedes hacer 5 preguntas relacionadas con lo enseñado, responde SOLO: "ERROR_TOPIC_MISMATCH"

Responde SOLO en el formato exacto especificado.`;

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getCurrentApiKey()}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { 
                        role: "system", 
                        content: "Eres un profesor pedagógico experto que crea 5 preguntas progresivas de examen basadas en conversaciones reales. Evalúas comprensión profunda y aplicación de conceptos."
                    },
                    { 
                        role: "user", 
                        content: quizPrompt 
                    }
                ],
                temperature: 0.6,
                max_tokens: 1200
            })
        });

        if (!res.ok) {
            console.error('❌ [QUIZ FINAL] Error generando quiz:', res.status);
            return [];
        }

        const data = await res.json();
        const quizText = data.choices[0]?.message?.content || '';
        console.log('📝 [QUIZ FINAL] Respuesta IA COMPLETA:', quizText);
        console.log('📝 [QUIZ FINAL] Respuesta IA (primeros 200):', quizText.substring(0, 200));
        
        // ✅ VALIDACIÓN: Verificar si hay relación de tema
        if (quizText.includes('ERROR_TOPIC_MISMATCH')) {
            console.warn('⚠️ [QUIZ FINAL] Las preguntas no están relacionadas con el tema:', topic);
            return { error: true, message: `Las preguntas no están directamente relacionadas con "${topic}". Por favor, continúa la conversación primero.` };
        }
        
        // Parsear las 5 preguntas
        const quizzes = [];
        const quizMatches = quizText.match(/QUIZ \d+:([\s\S]*?)(?=QUIZ \d+:|$)/g);
        
        if (!quizMatches) {
            console.warn('⚠️ [QUIZ FINAL] No se pudieron parsear los quices');
            return [];
        }

        quizMatches.forEach((quizBlock, quizIdx) => {
            const preguntaMatch = quizBlock.match(/Pregunta:\s*([^\n]+)/);
            const respuestaMatch = quizBlock.match(/Respuesta:\s*([a-d])/);
            const optionsMatches = quizBlock.match(/([a-d])\)\s*([^\n]+)/g);
            
            console.log(`📝 [QUIZ FINAL] Quiz ${quizIdx + 1} - Opciones encontradas:`, optionsMatches ? optionsMatches.length : 0);
            
            if (preguntaMatch && respuestaMatch && optionsMatches && optionsMatches.length >= 4) {
                const options = {};
                optionsMatches.forEach((opt, optIdx) => {
                    const parts = opt.split(')');
                    const letter = parts[0].trim();
                    const text = parts.slice(1).join(')').trim();
                    options[letter] = text;
                    console.log(`   ${letter}) ${text}`);
                });
                
                quizzes.push({
                    question: preguntaMatch[1].trim(),
                    options: options,
                    correctAnswer: respuestaMatch[1]
                });
                console.log(`✅ Quiz Final ${quizIdx + 1} parseado correctamente`);
            } else {
                console.warn(`⚠️ [QUIZ FINAL] Quiz ${quizIdx + 1} no cumple requisitos:`, {
                    preguntaMatch: !!preguntaMatch,
                    respuestaMatch: !!respuestaMatch,
                    optionsMatches: optionsMatches ? optionsMatches.length : 0
                });
            }
        });

        console.log('✅ [QUIZ FINAL] Quiz generados:', quizzes.length, 'sobre:', topic);
        console.log('📋 [QUIZ FINAL] Quizes finales:', JSON.stringify(quizzes, null, 2));
        return quizzes.slice(0, 5); // Máximo 5 quices
        
    } catch(err) {
        console.error('❌ [QUIZ FINAL] Error:', err);
        return [];
    }
}

/**
 * Inicia el modo de quiz automático
 */
async function startAutoQuiz() {
    isInQuizMode = true;
    send.setAttribute('disabled', '');
    send.classList.add('disabled');
    
    const topic = chats[currentChatId].title || 'el tema';
    showTyping();
    const result = await generateAutoQuiz(topic);
    removeTyping();
    
    // ✅ Manejar error de mismatch de tema
    if (result.error) {
        addMessage(result.message, 'assistant', null, new Date().toISOString());
        isInQuizMode = false;
        updateSendState();
        return;
    }
    
    const quizzes = result;
    if (quizzes.length === 0) {
        addMessage('No pude generar las preguntas. Intenta de nuevo. 📝', 'assistant', null, new Date().toISOString());
        isInQuizMode = false;
        updateSendState();
        return;
    }
    
    addMessage('Aquí están tus 2 preguntas. ¡Veamos cuánto aprendiste! 📋', 'assistant', null, new Date().toISOString());
    setTimeout(() => renderAutoQuiz(quizzes), 500);
}

/**
 * Renderiza los 2 quices con formato limpio
 */
function renderAutoQuiz(quizzes) {
    const container = document.createElement('div');
    container.className = 'message flex justify-start animate-slide-up';
    container.id = 'auto-quiz-container';
    
    const bubble = document.createElement('div');
    bubble.className = 'px-5 py-4 rounded-3xl msg-assistant border border-white/20 max-w-[95%] w-full';
    
    let html = '<div class="space-y-6">';
    html += '<h2 class="font-bold text-xl mb-4">📝 Quiz Rápido - 2 Preguntas (5 puntos c/u)</h2>';
    
    quizzes.forEach((quiz, idx) => {
        const quizNum = idx + 1;
        html += `
        <div class="border-t pt-4 ${idx === 0 ? 'border-t-0 pt-0' : ''}">
            <h3 class="font-bold text-lg mb-3">Pregunta ${quizNum} de 2</h3>
            <p class="mb-4 font-semibold text-white">${quiz.question}</p>
            <div class="space-y-3 mb-4">
        `;
        
        Object.entries(quiz.options).forEach(([key, value]) => {
            html += `
                <label class="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/20 transition border border-transparent hover:border-indigo-400">
                    <input type="radio" name="quiz_${idx}" value="${key}" class="w-5 h-5 cursor-pointer" style="accent-color: #818cf8;">
                    <span class="text-base font-medium">${key.toUpperCase()}) ${value}</span>
                </label>
            `;
        });
        
        html += `
            </div>
        </div>
        `;
    });
    
    html += `
        <div class="flex gap-3 pt-4 border-t">
            <button id="submitAutoQuiz" class="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition transform hover:scale-105">
                ✅ Enviar respuestas
            </button>
        </div>
    </div>`;
    
    bubble.innerHTML = html;
    container.appendChild(bubble);
    messagesDiv.appendChild(container);
    
    document.getElementById('submitAutoQuiz').addEventListener('click', () => {
        submitAutoQuiz(quizzes);
    });
    
    scrollToBottom();
}

/**
 * Renderiza el Quiz Final (5 preguntas) con el mismo formato que el quiz rápido
 */
function renderFinalQuiz(quizzes) {
    const container = document.createElement('div');
    container.className = 'message flex justify-start animate-slide-up';
    container.id = 'final-quiz-container';
    
    const bubble = document.createElement('div');
    bubble.className = 'px-5 py-4 rounded-3xl msg-assistant border border-white/20 max-w-[95%] w-full';
    
    let html = '<div class="space-y-6">';
    html += '<h2 class="font-bold text-xl mb-4">📚 Examen Final - 5 Preguntas (2 puntos c/u = 10 total)</h2>';
    
    quizzes.forEach((quiz, idx) => {
        const quizNum = idx + 1;
        html += `
        <div class="border-t pt-4 ${idx === 0 ? 'border-t-0 pt-0' : ''}">
            <h3 class="font-bold text-lg mb-3">Pregunta ${quizNum} de 5</h3>
            <p class="mb-4 font-semibold text-white">${quiz.question}</p>
            <div class="space-y-3 mb-4">
        `;
        
        Object.entries(quiz.options).forEach(([key, value]) => {
            html += `
                <label class="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/20 transition border border-transparent hover:border-blue-400">
                    <input type="radio" name="final_quiz_${idx}" value="${key}" class="w-5 h-5 cursor-pointer" style="accent-color: #818cf8;">
                    <span class="text-base font-medium">${key.toUpperCase()}) ${value}</span>
                </label>
            `;
        });
        
        html += `
            </div>
        </div>
        `;
    });
    
    html += `
        <div class="flex gap-3 pt-4 border-t">
            <button id="submitFinalQuiz" class="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition transform hover:scale-105">
                ✅ Enviar examen
            </button>
        </div>
    </div>`;
    
    bubble.innerHTML = html;
    container.appendChild(bubble);
    messagesDiv.appendChild(container);
    
    document.getElementById('submitFinalQuiz').addEventListener('click', () => {
        submitFinalQuiz(quizzes);
    });
    
    scrollToBottom();
}

/**
 * Envía y califica el Quiz Final
 * 5 preguntas × 2 puntos = 10 puntos totales
 */
async function submitFinalQuiz(quizzes) {
    const container = document.getElementById('final-quiz-container');
    const answers = [];
    const responses = [];
    
    // Recolectar respuestas
    quizzes.forEach((quiz, idx) => {
        const selected = document.querySelector(`input[name="final_quiz_${idx}"]:checked`);
        if (selected) {
            const isCorrect = selected.value === quiz.correctAnswer;
            answers.push(isCorrect);
            responses.push({
                question: quiz.question,
                userAnswer: selected.value,
                correct: quiz.correctAnswer,
                isCorrect: isCorrect,
                correctOption: quiz.options[quiz.correctAnswer],
                allOptions: quiz.options
            });
        }
    });
    
    // Desactivar inputs
    container.querySelectorAll('input').forEach(i => i.disabled = true);
    
    // Mostrar feedback con puntuación (5 preguntas × 2 puntos = 10)
    const correctCount = answers.filter(a => a).length;
    const totalPoints = correctCount * 2; // 2 puntos por pregunta correcta
    let feedback = `¡Has completado el examen final! 🎉\n\n**CALIFICACIÓN FINAL: ${totalPoints}/10**\n`;
    
    // Calificar con criterios educativos
    let grade = '';
    if (totalPoints === 10) {
        grade = '🌟 ¡EXCELENTE! Dominaste completamente el tema.';
    } else if (totalPoints >= 8) {
        grade = '✅ MUY BIEN. Tienes excelente comprensión del tema.';
    } else if (totalPoints >= 6) {
        grade = '👍 BIEN. Entiendes los conceptos principales, pero hay áreas por reforzar.';
    } else if (totalPoints >= 4) {
        grade = '⚠️ REGULAR. Necesitas repasar varios conceptos clave.';
    } else {
        grade = '📚 INSUFICIENTE. Te recomiendo repasar desde el inicio con nuevas explicaciones.';
    }
    
    feedback += `${grade}\n\n`;
    feedback += `Respondiste correctamente **${correctCount} de ${quizzes.length}** preguntas.\n\n`;
    feedback += `---\n\n`;
    
    // Procesar respuestas (con explicaciones detalladas para errores)
    for (let idx = 0; idx < responses.length; idx++) {
        const resp = responses[idx];
        feedback += `**Pregunta ${idx + 1} (2 puntos):** ${resp.question}\n\n`;
        feedback += `Tu respuesta: **${resp.userAnswer.toUpperCase()})** ${resp.allOptions[resp.userAnswer]} `;
        
        if (resp.isCorrect) {
            feedback += `✅ **¡CORRECTO!**\n\n`;
        } else {
            feedback += `❌ **INCORRECTO**\n\n`;
            feedback += `**Respuesta correcta:** **${resp.correct.toUpperCase()})** ${resp.correctOption}\n\n`;
            
            // Generar explicación detallada de por qué falló
            console.log('📝 [EXAMEN] Generando explicación para pregunta', idx + 1);
            showTyping();
            const explanation = await generateExplanationForWrongAnswer(
                resp.question,
                resp.userAnswer,
                resp.correct,
                resp.allOptions
            );
            removeTyping();
            
            feedback += `**📖 ¿Por qué fue incorrecto?**\n\n${explanation}\n\n`;
        }
        
        feedback += `---\n\n`;
    }
    
    addMessage(feedback, 'assistant', null, new Date().toISOString());
    isInQuizMode = false;
    
    // ✅ MARCAR QUIZ COMO FINALIZADO Y GUARDAR
    quizFinalized = true;
    chats[currentChatId].quizFinalized = true;
    saveChats();
    
    console.log('🔒 [QUIZ FINAL] Quiz finalizado. Chat cerrado.');
    
    // ✅ BLOQUEAR BOTÓN DE ENVÍO PERMANENTEMENTE
    send.setAttribute('disabled', 'disabled');
    send.classList.add('disabled');
    send.classList.add('quiz-finalized');  // Clase especial para bloqueo permanente
    send.style.opacity = '0.4';
    send.style.pointerEvents = 'none';
    send.style.cursor = 'not-allowed';
    
    // ✅ MENSAJE FINAL
    setTimeout(() => {
        const finalMessage = `¡Excelente trabajo! 🎉 Has completado el examen final de este tema. 

¿Quieres aprender algo nuevo? Puedes crear un nuevo chat para explorar otros temas.`;
        addMessage(finalMessage, 'assistant', null, new Date().toISOString());
    }, 1500);
}

/**
 * Envía y califica el quiz automático
 */
/**
 * Genera explicación pedagógica de por qué una respuesta es incorrecta
 * @param {string} question - La pregunta del quiz
 * @param {string} userAnswer - Respuesta que eligió el estudiante
 * @param {string} correctAnswer - La respuesta correcta
 * @param {object} allOptions - Todas las opciones disponibles
 * @returns {Promise<string>} Explicación pedagógica
 */
async function generateExplanationForWrongAnswer(question, userAnswer, correctAnswer, allOptions) {
    try {
        const userAnswerText = allOptions[userAnswer];
        const correctAnswerText = allOptions[correctAnswer];
        
        const prompt = `Eres un profesor pedagógico. El estudiante respondió incorrectamente a una pregunta de quiz.
        
Pregunta: "${question}"
Respuesta del estudiante: "${userAnswer.toUpperCase()}) ${userAnswerText}"
Respuesta correcta: "${correctAnswer.toUpperCase()}) ${correctAnswerText}"

Por favor, explica BREVEMENTE (2-3 líneas):
1. Por qué la respuesta del estudiante es incorrecta
2. Por qué la respuesta correcta es mejor

Sé empático y motivador. Usa emojis ocasionales. Responde de forma conversacional, no formal.`;

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getCurrentApiKey()}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { 
                        role: "system", 
                        content: "Eres un profesor empático que explica errores en quices de forma constructiva y breve." 
                    },
                    { 
                        role: "user", 
                        content: prompt 
                    }
                ],
                temperature: 0.6,
                max_tokens: 150
            })
        });

        if (!res.ok) {
            console.error('❌ [EXPLICACIÓN] Error generando explicación');
            return `La respuesta correcta es la opción **${correctAnswer.toUpperCase()}** porque contiene la información más precisa sobre el tema.`;
        }

        const data = await res.json();
        return data.choices[0]?.message?.content || `La respuesta correcta es **${correctAnswer.toUpperCase()}**.`;
        
    } catch(err) {
        console.error('❌ [EXPLICACIÓN] Error:', err);
        return `La respuesta correcta es **${correctAnswer.toUpperCase()}**.`;
    }
}

/**
 * Envía y califica el quiz automático CON EXPLICACIONES
 */
async function submitAutoQuiz(quizzes) {
    const container = document.getElementById('auto-quiz-container');
    const answers = [];
    const responses = [];
    
    // Recolectar respuestas
    quizzes.forEach((quiz, idx) => {
        const selected = document.querySelector(`input[name="quiz_${idx}"]:checked`);
        if (selected) {
            const isCorrect = selected.value === quiz.correctAnswer;
            answers.push(isCorrect);
            responses.push({
                question: quiz.question,
                userAnswer: selected.value,
                correct: quiz.correctAnswer,
                isCorrect: isCorrect,
                correctOption: quiz.options[quiz.correctAnswer],
                allOptions: quiz.options
            });
        }
    });
    
    // Desactivar inputs
    container.querySelectorAll('input').forEach(i => i.disabled = true);
    
    // Mostrar feedback con puntuación (2 preguntas × 5 puntos = 10)
    const correctCount = answers.filter(a => a).length;
    const totalPoints = correctCount * 5; // 5 puntos por pregunta correcta
    let feedback = `¡Excelente esfuerzo! 🎉\n\n**Puntuación: ${totalPoints}/10**\n`;
    feedback += `Acertaste **${correctCount} de ${quizzes.length}** preguntas.\n\n`;
    feedback += `---\n\n`;
    
    // Procesar respuestas (con explicaciones detalladas)
    for (let idx = 0; idx < responses.length; idx++) {
        const resp = responses[idx];
        feedback += `**Pregunta ${idx + 1} (5 puntos):** ${resp.question}\n\n`;
        feedback += `Tu respuesta: **${resp.userAnswer.toUpperCase()})** ${resp.allOptions[resp.userAnswer]} `;
        
        if (resp.isCorrect) {
            feedback += `✅ **¡CORRECTO!**\n\n`;
        } else {
            feedback += `❌ **INCORRECTO**\n\n`;
            feedback += `**Respuesta correcta:** **${resp.correct.toUpperCase()})** ${resp.correctOption}\n\n`;
            
            // Generar explicación de por qué falló
            console.log('📝 [QUIZ] Generando explicación para pregunta', idx + 1);
            showTyping();
            const explanation = await generateExplanationForWrongAnswer(
                resp.question,
                resp.userAnswer,
                resp.correct,
                resp.allOptions
            );
            removeTyping();
            
            feedback += `**📖 ¿Por qué fue incorrecto?**\n\n${explanation}\n\n`;
        }
        
        feedback += `---\n\n`;
    }
    
    addMessage(feedback, 'assistant', null, new Date().toISOString());
    isInQuizMode = false;
    updateSendState();
    
    // ✅ CONTINUAR ESCRIBIENDO AUTOMÁTICAMENTE DESPUÉS DEL QUIZ
    setTimeout(async () => {
        console.log('🤖 [QUIZ] Continuando explicación después del quiz...');
        showTyping();
        
        try {
            // Crear prompt para que IA continúe explicando el tema
            const continuationPrompt = `El estudiante acaba de completar un quiz rápido sobre el tema que hemos estado discutiendo. 
Felicítalo brevemente y luego continúa explicando más aspectos del tema, profundizando en conceptos relacionados o ejemplos adicionales.
Mantén un tono educativo y amigable. No hagas un nuevo quiz, solo sigue enseñando.`;
            
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getCurrentApiKey()}`
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages: [
                        ...messages,
                        { role: 'user', content: continuationPrompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 600
                })
            });
            
            if (!res.ok) {
                throw new Error(`API Error: ${res.status}`);
            }
            
            const data = await res.json();
            const continuation = data.choices[0]?.message?.content || '';
            
            if (continuation) {
                removeTyping();
                addMessage(continuation, 'assistant', null, new Date().toISOString());
                // Incrementar contador de intercambios
                exchangeCount++;
                console.log(`📊 [INTERCAMBIOS] Total después de continuación: ${exchangeCount}`);
                renderMessages();
            } else {
                removeTyping();
                console.warn('⚠️ [QUIZ] No se pudo obtener continuación');
            }
        } catch (err) {
            removeTyping();
            console.error('❌ [QUIZ] Error en continuación:', err);
        }
    }, 1500);
}

/**
 * [DEPRECATED] Esta función ya no se usa - Se pasa directo al quiz final
 * Se mantiene comentada por compatibilidad
 */
/*
function showFinalQuizOrExplanationOptions() {
    const div = document.createElement('div');
    div.className = 'message flex justify-start animate-slide-up';
    div.id = 'final-quiz-options';
    
    const messageText = "Creo que ya tenemos suficiente contexto. ¿Quieres demostrar lo que aprendiste con un examen final (5 preguntas) o prefieres explicar el tema con tus propias palabras?";
    
    const html = `
        <div class="px-5 py-4 rounded-3xl msg-assistant border border-white/20 max-w-[95%]">
            <p class="mb-4">${messageText}</p>
            <div class="flex gap-3 flex-wrap">
                <button class="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition final-opt-btn" data-action="final-quiz">
                    📚 Examen Final (5 preguntas)
                </button>
                <button class="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition final-opt-btn" data-action="explain">
                    💬 Explicar con mis propias palabras
                </button>
            </div>
        </div>
    `;
    
    div.innerHTML = html;
    messagesDiv.appendChild(div);
    
    const buttons = div.querySelectorAll('.final-opt-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            buttons.forEach(b => b.disabled = true);
            const action = e.target.dataset.action;
            
            const optionsDiv = document.getElementById('final-quiz-options');
            if (optionsDiv) optionsDiv.remove();
            
            if (action === 'final-quiz') {
                console.log('🎯 [FINAL QUIZ] Usuario eligió examen final');
                startFinalQuiz();
            } else if (action === 'explain') {
                console.log('📝 [EXPLAIN] Usuario eligió explicación');
                startExplanationMode();
            }
        }, { once: true });
    });
    
    scrollToBottom();
}
*/

/**
 * Muestra opciones después de completar un quiz
 * @param {string} quizType - 'auto' para quiz rápido, 'final' para quiz definitivo
 */
function showPostQuizOptions(quizType) {
    const div = document.createElement('div');
    div.className = 'message flex justify-start animate-slide-up';
    div.id = 'post-quiz-options';
    
    let messageText = '';
    let showFinalQuiz = false;
    
    if (quizType === 'auto') {
        // Después del quiz rápido: solo opción de continuar conversando
        messageText = "¡Bien hecho! 💪 Continuemos explorando este tema juntos.";
        showFinalQuiz = false;
    } else if (quizType === 'final') {
        // Después del quiz definitivo: solo opción de continuar
        messageText = "¡Felicidades por completar el examen final! 🎉 ¿Quieres reforzar otro aspecto del tema o aprender algo completamente nuevo?";
        showFinalQuiz = false;
    }
    
    let buttonsHTML = `
        <button class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition post-quiz-btn" data-action="continue">
            💬 Continuar charlando del tema
        </button>
    `;
    
    div.innerHTML = `
        <div class="px-5 py-4 rounded-3xl msg-assistant border border-white/20 max-w-[95%]">
            <p class="mb-4">${messageText}</p>
            <div class="flex gap-3 flex-wrap">
                ${buttonsHTML}
            </div>
        </div>
    `;
    
    messagesDiv.appendChild(div);
    
    const buttons = div.querySelectorAll('.post-quiz-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            buttons.forEach(b => b.disabled = true);
            const action = e.target.dataset.action;
            
            if (action === 'continue') {
                // Usuario quiere continuar charlando
                const optionsDiv = document.getElementById('post-quiz-options');
                if (optionsDiv) optionsDiv.remove();
                isInQuizMode = false;
                updateSendState();
                const input = document.getElementById('input');
                if (input) input.focus();
            }
        }, { once: true });
    });
    
    scrollToBottom();
}

/**
 * Inicia el modo de quiz final (5 preguntas detalladas)
 */
async function startFinalQuiz() {
    isInQuizMode = true;
    send.setAttribute('disabled', '');
    send.classList.add('disabled');
    
    const topic = chats[currentChatId].title || 'el tema';
    showTyping();
    const result = await generateFinalQuiz(topic);
    removeTyping();
    
    // ✅ Manejar error de mismatch de tema
    if (result.error) {
        addMessage(result.message, 'assistant', null, new Date().toISOString());
        isInQuizMode = false;
        updateSendState();
        return;
    }
    
    const quizzes = result;
    if (quizzes.length === 0) {
        addMessage('No pude generar las preguntas. Intenta de nuevo. 📝', 'assistant', null, new Date().toISOString());
        isInQuizMode = false;
        updateSendState();
        return;
    }
    
    addMessage('¡Aquí viene tu examen final con 5 preguntas! Demuestra todo lo que aprendiste. 📚', 'assistant', null, new Date().toISOString());
    setTimeout(() => renderFinalQuiz(quizzes), 500);
}

/**
 * Inicia el modo de explicación (estudiante explica)
 */
function startExplanationMode() {
    isInQuizMode = true;
    
    const explanationMsg = document.createElement('div');
    explanationMsg.className = 'message flex justify-start animate-slide-up';
    explanationMsg.innerHTML = `
        <div class="px-5 py-4 rounded-3xl msg-assistant border border-white/20 max-w-[80%]">
            <p class="mb-3">📚 <strong>Modo Explicación</strong></p>
            <p class="mb-4">Explica con tus propias palabras lo que acabas de aprender. Sé lo más detallado que puedas.</p>
            <p class="text-sm opacity-70">Presiona "Enviar" cuando termines tu explicación.</p>
        </div>
    `;
    messagesDiv.appendChild(explanationMsg);
    scrollToBottom();
}

function showQuizOptions() {
    if (isShowingQuizOptions) return; // Prevenir múltiples llamadas
    isShowingQuizOptions = true;
    
    const div = document.createElement('div');
    div.className = 'message flex justify-start animate-slide-up';
    div.innerHTML = `
        <div class="px-5 py-4 rounded-3xl msg-assistant border border-white/20 max-w-[80%]">
            <p class="mb-4">¡Excelente! Ahora vamos a reforzar lo que aprendiste. ¿Qué prefieres hacer?</p>
            <div class="flex gap-3 flex-wrap">
                <button class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition quiz-option-btn" data-action="quiz">📝 Quiz Rápido (2 preguntas)</button>
                <button class="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition quiz-option-btn" data-action="final">🏆 Examen Final (5 preguntas)</button>
                <button class="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition quiz-option-btn" data-action="explain">💬 Explica con tus palabras</button>
            </div>
        </div>
    `;
    messagesDiv.appendChild(div);
    
    const buttons = div.querySelectorAll('.quiz-option-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            // Desactivar todos los botones después del primer click
            buttons.forEach(b => b.disabled = true);
            
            const action = e.target.dataset.action;
            if (action === 'quiz') {
                startAutoQuiz();
            } else if (action === 'final') {
                startFinalQuiz();
            } else if (action === 'explain') {
                startExplanationMode();
            }
        }, { once: true }); // Solo ejecutar una vez
    });
    
    scrollToBottom();
}

// ======== GESTIÓN DE MODAL DE CONFIRMACIÓN ========
let pendingDeleteId = null;

/**
 * Muestra modal de confirmación para eliminar
 */
function showConfirmModal() {
    const modal = document.getElementById('confirmModal');
    // No modificar overflow - CSS ya maneja con scrollbar-gutter: stable
    // Scroll al top
    window.scrollTo(0, 0);
    // Mostrar modal
    modal.classList.add('show');
    if (darkMode) {
        modal.classList.add('dark-theme');
        modal.classList.remove('light-theme');
    } else {
        modal.classList.add('light-theme');
        modal.classList.remove('dark-theme');
    }
}

/**
 * Cierra modal de confirmación
 */
function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.remove('show');
    pendingDeleteId = null;
    // No restaurar overflow - CSS maneja con scrollbar-gutter: stable
}

/**
 * Confirma y ejecuta eliminación de chat(s)
 */
function confirmDelete() {
    if (!pendingDeleteId) return;
    
    if (pendingDeleteId === 'ALL') {
        // Eliminar TODOS los chats
        chats = {};
        currentChatId = Date.now().toString();
        chats[currentChatId] = { messages: [], title: 'Nuevo Chat', createdAt: new Date().toISOString() };
        saveChats();
        renderChatList();
        renderMessages();
        document.querySelector('.modal-message').textContent = '¿Estás seguro de que deseas eliminar este chat? Esta acción no se puede deshacer.';
    } else {
        // Eliminar un chat específico - finalizar su título antes de eliminarlo
        const id = pendingDeleteId;
        
        // Si es el chat actual, finalizar el título antes de eliminarlo
        if (id === currentChatId) {
            messages = chats[id].messages;
            finalizeChatTitle().then(() => {
                delete chats[id];
                const keys = Object.keys(chats);
                currentChatId = keys.length ? keys[0] : Date.now().toString();
                if (!chats[currentChatId]) chats[currentChatId] = { messages: [], title: 'Nuevo Chat', createdAt: new Date().toISOString() };
                saveChats();
                renderChatList();
                renderMessages();
            });
        } else {
            delete chats[id];
            saveChats();
            renderChatList();
            renderMessages();
        }
    }
    closeConfirmModal();
}

/**
 * Cerrar modal al hacer click fuera del contenido
 */
document.getElementById('confirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') {
        closeConfirmModal();
    }
});

/**
 * Event listener para botón "Borrar todos los chats"
 */
document.addEventListener('click', function(e) {
    if (e.target.id === 'btnDeleteAllChats') {
        pendingDeleteId = 'ALL';
        document.querySelector('.modal-title').textContent = '⚠️ Confirmar eliminación';
        document.querySelector('.modal-message').textContent = '¿Estás seguro de que deseas eliminar TODOS los chats? Esta acción no se puede deshacer.';
        showConfirmModal();
    }
});

// ======== DETECTAR TECLADO EN MOBILE Y HACER SCROLL ========
/**
 * Hace scroll agresivo hacia abajo para ver el chat completo
 * cuando el teclado aparece en mobile
 */
function scrollToBottomAggressive() {
    // SOLO scroll dentro del messagesArea, NO en la página
    requestAnimationFrame(() => {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}

let lastViewportHeight = window.innerHeight;

// PREVENIR que el body/html se scrollee
window.addEventListener('resize', () => {
    const currentHeight = window.innerHeight;
    
    // Si la altura cambió, es probablemente por el teclado
    if (currentHeight < lastViewportHeight - 50) {
        console.log('⌨️ [TECLADO] Teclado detectado - Previniendo scroll de página');
        // Prevenir scroll del body
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        // Scroll solo en messagesArea
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }
    
    lastViewportHeight = currentHeight;
});

// Detectar con visualviewport
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        console.log('⌨️ [TECLADO] Teclado detectado (visualViewport)');
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}

// Cuando el input recibe focus, scroll solo en messagesArea
input.addEventListener('focus', () => {
    console.log('⌨️ [INPUT] Focus detectado');
    // Prevenir scroll del body
    document.body.style.overflow = 'hidden !important';
    document.documentElement.style.overflow = 'hidden !important';
    // Scroll en el messagesArea
    setTimeout(() => {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }, 300);
});

// Cuando escribe, scroll dentro de messagesArea
input.addEventListener('keydown', () => {
    document.body.style.overflow = 'hidden';
    messagesArea.scrollTop = messagesArea.scrollHeight;
});

// FUERZA: Asegurar que body/html nunca tengan scroll
document.body.style.overflow = 'hidden';

document.documentElement.style.overflow = 'hidden';
