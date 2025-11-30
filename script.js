/* ============================================
   TUTORIA - SCRIPT.JS
   Lógica completa de la aplicación
   ============================================ */

// CONFIGURACIÓN
const OPENROUTER_API_KEY = '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';
const MODEL = "x-ai/grok-4.1-fast:free";

const SYSTEM_PROMPT = `Eres TutorIA, tutor socrático pedagógico experto. Tu objetivo: que el estudiante ENTIENDA de verdad.

ESTRATEGIA:
1. PREGUNTA primero qué sabe del tema (no des respuesta directa)
2. Basándote en su respuesta, EXPLICA bien con analogías simples
3. VERIFICA comprensión: "¿Esto tiene sentido?" o "¿Hay alguna parte confusa?"
4. Si dice "sí" o "entendí" → CONTINÚA profundizando poco a poco
5. Si dice "no" o "confuso" → CAMBIA estrategia con ejemplos diferentes

IMPORTANTE - NO APURES:
- Responde en 5-7 líneas máximo (no cortado)
- USA emojis ocasionales para hacer ameno
- DESPUÉS DE 2-3 INTERCAMBIOS: pregunta "¿Quieres hacer un Quiz para practicar o prefieres una Explicación?"
- Solo ofrece Quiz/Explicación cuando el estudiante ya entienda bien el tema

Tono: Paciente, empático, motivador. Eres su profe, no Wikipedia.`;


// ======== SISTEMA DE ROTACIÓN DE API KEYS ========
const API_KEYS_POOL = [
    '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'
];
let currentKeyIndex = 0;

/**
 * Obtiene la API key actual del pool
 * @returns {string|null} API key o null si no hay disponible
 */
function getCurrentApiKey() {
    if (currentKeyIndex >= API_KEYS_POOL.length) return null;
    return API_KEYS_POOL[currentKeyIndex];
}

/**
 * Rota hacia la siguiente API key disponible
 * @returns {boolean} true si hay más keys, false si se agotaron
 */
function rotateApiKey() {
    currentKeyIndex++;
    if (currentKeyIndex >= API_KEYS_POOL.length) {
        console.error('No API keys available');
        return false;
    }
    return true;
}

/**
 * Elimina la API key actual del pool (por error 401/403)
 */
function removeCurrentKey() {
    if (currentKeyIndex < API_KEYS_POOL.length) {
        API_KEYS_POOL.splice(currentKeyIndex, 1);
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
const previewImg = imagePreview.querySelector('img');
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
if(userName) {
    startApp(userName);
} else {
    welcome.classList.remove('hidden');
    app.classList.add('hidden');
}

// Event listener para botón "Comenzar"
startBtn.onclick = () => {
    const name = nameInput.value.trim();
    if(name) {
        userName = name;
        localStorage.setItem('tutoria_userName', name);
        startApp(name);
    }
};

/**
 * Inicia la aplicación después de que el usuario ingresa su nombre
 * @param {string} name - Nombre del usuario
 */
function startApp(name) {
    welcome.classList.add('hidden');
    app.classList.remove('hidden');
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
    currentChatId = Date.now().toString();
    chats[currentChatId] = { messages: [], title: 'Nuevo Chat', createdAt: new Date().toISOString() };
    messages = chats[currentChatId].messages;
    exchangeCount = 0; // ← RESET contador de intercambios
    saveChats();
    renderChatList();
    renderMessages();
    sidebar.classList.add('hidden');
};

/**
 * Renderiza la lista de chats en el sidebar
 * Incluye fecha exacta de creación y opción de eliminar
 */
function renderChatList() {
    chatList.innerHTML = '<button id="deleteAllChats" class="w-full text-center px-4 py-3 mb-3 rounded-lg text-white font-semibold transition">🗑️ Borrar todos los chats</button>';
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
            currentChatId = id;
            messages = chats[id].messages;
            exchangeCount = 0; // ← RESET contador al cambiar de chat
            localStorage.setItem('tutoria_currentChatId', id);
            renderMessages();
            sidebar.classList.add('hidden');
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

// ======== RENDERIZADO DE MENSAJES ========
/**
 * Renderiza todos los mensajes del chat actual desde cache
 */
function renderMessages() {
    messagesDiv.innerHTML = '';
    if (messages.length === 0) {
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
        messages.forEach(msg => {
            addMessage(msg.content, msg.role, msg.image || null, msg.timestamp, false);
        });
    }
    
    // Mostrar contador de mensajes en consola
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
    
    // Actualizar título del chat con el primer mensaje del usuario (solo en el primer mensaje)
    if (messages.length === 2 && textToSend && chats[currentChatId].title === 'Nuevo Chat') {
        // Extraer tema del mensaje: busca palabras clave o usa los primeros 50 caracteres
        let chatTitle = textToSend.slice(0, 60).trim();
        
        // Limpiar el título removiendo puntuación al final si es necesario
        chatTitle = chatTitle.replace(/[¿?!¡.,:;]+$/, '').trim();
        
        chats[currentChatId].title = chatTitle || 'Nuevo Chat';
        saveChats();
        renderChatList();
    }
    
    // Limpiar input solo si se envió desde la caja de texto
    if (typeof userChoice === 'undefined' || userChoice === null) input.value = '';
    input.style.height = '44px'; // Resetear altura al original
    clearImagePreview(); // Limpiar UI y selectedImage
    
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
            max_tokens: 500,
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

                console.log('💬 [OPENROUTER] Enviando a OpenRouter (intento ' + (retryCount + 1) + ')...');

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
                        max_tokens: 300,
                        top_p: 0.9,
                        frequency_penalty: 0,
                        presence_penalty: 0
                    })
                });

                console.log('💬 [OPENROUTER] Status de respuesta:', res.status, res.statusText);

                if (res.status === 401 || res.status === 403) {
                    console.warn(`❌ [OPENROUTER] API key falló (${res.status}), rotando...`);
                    if (!rotateApiKey()) {
                        throw new Error('All API keys exhausted');
                    }
                    retryCount++;
                } else {
                    break;
                }
            } catch (fetchErr) {
                console.error('❌ [OPENROUTER] Error en fetch:', fetchErr.message);
                retryCount++;
                if (retryCount >= maxRetries) {
                    throw fetchErr;
                }
            }
        }

        if (!res || !res.ok) {
            console.error('❌ [OPENROUTER] Error en respuesta final:', res?.status, res?.statusText);
            if (res && (res.status === 401 || res.status === 403)) {
                removeCurrentKey();
            }
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
        
        // Resetear flag de quiz options
        isShowingQuizOptions = false;
        
        // SOLO ofrecer Quiz/Explicación después de 2-3 intercambios
        // Detectar patrones que indican que el modelo pregunta si quiere continuar
        const shouldOfferQuiz = reply.includes('¿Quieres hacer un Quiz') || 
                               reply.includes('Quiz o una Explicación') ||
                               reply.includes('¿Quieres practicar?') ||
                               reply.includes('¿deseas practicar?');
        
        // Solo mostrar opciones después de al menos 2 intercambios del modelo (4 mensajes totales)
        if (shouldOfferQuiz && exchangeCount >= 2 && !isInQuizMode) {
            console.log('🎯 [QUIZ] Oferta de Quiz detectada después de', exchangeCount, 'intercambios');
            setTimeout(() => showQuizOptions(), 800);
        } else if (exchangeCount >= 2 && !isInQuizMode) {
            console.log('📝 [CHAT] Intercambio', exchangeCount, 'completado. Esperando siguiente pregunta...');
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
            errorMsg += "Verifica tu conexión a internet y intenta de nuevo.";
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
        img.className = 'w-full mb-2 rounded-lg';
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
            <p class="${titleClass} text-lg font-bold mb-2">📸 Seleccionar Foto</p>
            <p class="${textClass} mb-4 text-sm leading-relaxed">
                Esta función reconoce <strong>texto en imágenes</strong>. Solo funcionará si la foto contiene texto legible (documentos, pizarras, libros, etc.).
            </p>
            <p class="${warningClass} text-xs mb-4 font-semibold">
                ⚠️ Si la foto no tiene texto o el texto no es legible, la transcripción fallará.
            </p>
            <p class="${textClass} text-xs mb-6 opacity-75">
                ⏱️ La transcripción puede demorar 10-15 segundos. Por favor, espera pacientemente.
            </p>
            <div class="flex gap-3 justify-end">
                <button id="cancelOCRModal" class="px-4 py-2 rounded-lg transition font-medium text-sm ${isLightMode ? 'bg-gray-200 hover:bg-gray-300 text-gray-800' : 'bg-white/10 hover:bg-white/20 text-white'}">
                    Cancelar
                </button>
                <button id="continueOCRModal" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition font-medium text-sm">
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
                previewImg.src = selectedImage;
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
    previewImg.src = '';
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
            <p class="${titleClass} text-lg font-bold mb-2">❌ Error de Transcripción</p>
            <p class="${textClass} mb-6 text-sm leading-relaxed">
                La foto que subiste no contiene texto legible o el texto no se pudo transcribir correctamente.
            </p>
            <p class="${hintClass} text-xs mb-6 font-semibold">
                💡 Intenta con:<br>• Una foto de mejor calidad<br>• Texto más grande o legible<br>• Otra imagen
            </p>
            <div class="flex gap-3 justify-end">
                <button id="closeErrorModal" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition font-medium text-sm">
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
        console.log('🎯 [QUIZ] Generando quiz automático sobre:', topic);
        
        // Obtener contexto de la CONVERSACIÓN REAL
        const recentMessages = messages.slice(-6); // Últimos 3 intercambios
        const conversationContext = recentMessages
            .map(m => `${m.role === 'user' ? 'Estudiante' : 'TutorIA'}: ${m.content.substring(0, 200)}`)
            .join('\n\n');
        
        const quizPrompt = `Eres un profesor experto. Basándote en ESTA CONVERSACIÓN REAL sobre "${topic}", 
genera EXACTAMENTE 2 preguntas de opción múltiple que verifiquen la comprensión específica de lo discutido.

CONVERSACIÓN:
${conversationContext}

INSTRUCCIONES:
- Preguntas ESPECÍFICAS basadas en conceptos mencionados en la conversación (no genéricas)
- Opciones incorrectas deben ser ENGAÑOSAS pero relacionadas (errores comunes, conceptos similares)
- 4 opciones por pregunta (a, b, c, d)

Formato EXACTO:
QUIZ 1:
Pregunta: [pregunta específica sobre la conversación]
a) [opción engañosa]
b) [RESPUESTA CORRECTA - directa de la conversación]
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

Responde SOLO en este formato exacto.`;

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
        console.log('📝 [QUIZ] Respuesta IA:', quizText.substring(0, 200));
        
        // Parsear las 2 preguntas del formato EXACTO
        const quizzes = [];
        const quizMatches = quizText.match(/QUIZ \d+:([\s\S]*?)(?=QUIZ \d+:|$)/g);
        
        if (!quizMatches) {
            console.warn('⚠️ [QUIZ] No se pudieron parsear los quices');
            return [];
        }

        quizMatches.forEach(quizBlock => {
            const preguntaMatch = quizBlock.match(/Pregunta:\s*(.+)/);
            const respuestaMatch = quizBlock.match(/Respuesta:\s*([a-d])/);
            const optionsMatches = quizBlock.match(/([a-d]\))\s*(.+)/g);
            
            if (preguntaMatch && respuestaMatch && optionsMatches && optionsMatches.length >= 4) {
                const options = {};
                optionsMatches.forEach(opt => {
                    const [letter, text] = opt.split(')').map(s => s.trim());
                    options[letter] = text;
                });
                
                quizzes.push({
                    question: preguntaMatch[1].trim(),
                    options: options,
                    correctAnswer: respuestaMatch[1]
                });
            }
        });

        console.log('✅ [QUIZ] Quiz generados:', quizzes.length, 'sobre:', topic);
        return quizzes.slice(0, 2); // Máximo 2 quices
        
    } catch(err) {
        console.error('❌ [QUIZ] Error:', err);
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
    const quizzes = await generateAutoQuiz(topic);
    removeTyping();
    
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
    bubble.className = 'px-5 py-4 rounded-3xl msg-assistant border border-white/20 max-w-[90%] w-full';
    
    let html = '<div class="space-y-6">';
    
    quizzes.forEach((quiz, idx) => {
        const quizNum = idx + 1;
        html += `
        <div class="border-t pt-4 ${idx === 0 ? 'border-t-0 pt-0' : ''}">
            <h3 class="font-bold text-lg mb-3">Pregunta ${quizNum} de 2</h3>
            <p class="mb-4 font-semibold">${quiz.question}</p>
            <div class="space-y-3 mb-4">
        `;
        
        Object.entries(quiz.options).forEach(([key, value]) => {
            html += `
                <label class="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/10 transition">
                    <input type="radio" name="quiz_${idx}" value="${key}" class="quiz-radio w-4 h-4">
                    <span>${key.toUpperCase()}) ${value}</span>
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
            <button id="submitAutoQuiz" class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition">
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
    
    // Mostrar feedback
    const correctCount = answers.filter(a => a).length;
    let feedback = `¡Excelente esfuerzo! 🎉 Acertaste ${correctCount} de ${quizzes.length} preguntas.\n\n`;
    
    // Procesar respuestas (ahora con explicaciones)
    for (let idx = 0; idx < responses.length; idx++) {
        const resp = responses[idx];
        feedback += `**Pregunta ${idx + 1}:** ${resp.question}\n`;
        feedback += `Tu respuesta: **${resp.userAnswer.toUpperCase()})** ${resp.isCorrect ? '✅ ¡CORRECTO!' : '❌'}\n`;
        
        if (!resp.isCorrect) {
            feedback += `Respuesta correcta: **${resp.correct.toUpperCase()})** ${resp.correctOption}\n\n`;
            
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
            
            feedback += `📖 **Explicación:** ${explanation}\n`;
        }
        
        feedback += '\n';
    }
    
    addMessage(feedback, 'assistant', null, new Date().toISOString());
    isInQuizMode = false;
    updateSendState();
    
    // Preguntar si quiere más práctica
    setTimeout(() => {
        let followUp;
        if (correctCount === quizzes.length) {
            followUp = "¡Perfecto! 🌟 Respondiste correctamente todas las preguntas. ¿Quieres aprender un concepto nuevo o reforzar algo más?";
        } else if (correctCount === 0) {
            followUp = "Parece que el tema aún no está claro. No te preocupes, es normal. 💪 ¿Quieres que explique de nuevo de forma diferente?";
        } else {
            followUp = `Muy bien, acertaste ${correctCount} de ${quizzes.length}. Hay algunos temas por reforzar. ¿Quieres repasar esa parte o pasar a otro tema?`;
        }
        addMessage(followUp, 'assistant', null, new Date().toISOString());
    }, 1500);
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
                <button class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition quiz-option-btn" data-action="quiz">📝 Hacer Quiz</button>
                <button class="px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition quiz-option-btn" data-action="explain">💬 Explica con tus palabras</button>
            </div>
        </div>
    `;
    messagesDiv.appendChild(div);
    
    const buttons = div.querySelectorAll('.quiz-option-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            // Desactivar ambos botones después del primer click
            buttons.forEach(b => b.disabled = true);
            
            const action = e.target.dataset.action;
            if (action === 'quiz') {
                startAutoQuiz();
            } else if (action === 'explain') {
                startExplanationMode();
            }
        }, { once: true }); // Solo ejecutar una vez
    });
    
    scrollToBottom();
}

/**
 * Inicia el modo de quiz automático
 */
async function startAutoQuiz() {
    isInQuizMode = true;
    send.setAttribute('disabled', '');
    send.classList.add('disabled');
    
    const topic = chats[currentChatId].title || 'el tema';
    const quizzes = await generateAutoQuiz(topic);
    
    if (quizzes.length === 0) {
        addMessage('No pude generar las preguntas. Intenta de nuevo.', 'assistant', null, new Date().toISOString());
        isInQuizMode = false;
        updateSendState();
        return;
    }
    
    renderAutoQuiz(quizzes);
}

// ======== GESTIÓN DE MODAL DE CONFIRMACIÓN ========
let pendingDeleteId = null;

/**
 * Muestra modal de confirmación para eliminar
 */
function showConfirmModal() {
    const modal = document.getElementById('confirmModal');
    // Remover overflow antes de mostrar
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
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
    // Restaurar scroll
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
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
        // Eliminar un chat específico
        const id = pendingDeleteId;
        delete chats[id];
        if (id === currentChatId) {
            const keys = Object.keys(chats);
            currentChatId = keys.length ? keys[0] : Date.now().toString();
            if (!chats[currentChatId]) chats[currentChatId] = { messages: [], title: 'Nuevo Chat', createdAt: new Date().toISOString() };
        }
        saveChats();
        renderChatList();
        renderMessages();
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
    if (e.target.id === 'deleteAllChats') {
        pendingDeleteId = 'ALL';
        document.querySelector('.modal-title').textContent = '⚠️ Confirmar eliminación';
        document.querySelector('.modal-message').textContent = '¿Estás seguro de que deseas eliminar TODOS los chats? Esta acción no se puede deshacer.';
        showConfirmModal();
    }
});
