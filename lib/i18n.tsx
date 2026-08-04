"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Lang = "en" | "pt";

const translations = {
  en: {
    // Sidebar
    voiceAi: "novastructa.com",
    callLog: "Call Log",
    settings: "Settings",
    scriptEditor: "Script Editor",
    agentOnline: "Agent online",
    lightMode: "Light mode",
    darkMode: "Dark mode",

    // Call Log
    inboundVoice: "Inbound Voice",
    callLogTitle: "Call Log",
    all: "All",
    transferred: "Transferred",
    booked: "Booked",
    callback: "Callback",
    afterHours: "After Hours",
    disqualified: "Disqualified",
    dropped: "Dropped",
    today: "Today",
    custom: "Custom",
    total: "Total",
    noCallsMatch: "No calls match this filter",
    callSummary: "Call Summary",
    noSummary: "No summary available",
    recording: "Recording",
    noRecording: "No recording available",
    openInGhl: "Open in GHL",
    clickStartDate: "Click a start date",
    clickEndDate: "Now click an end date",
    rangeSelected: "Range selected",
    yesterday: "Yesterday",

    // Settings
    configuration: "Configuration",
    settingsTitle: "Settings",
    settingsDesc: "Changes auto-save and go live on the next inbound call.",
    saving: "Saving...",

    // Section titles
    callRouting: "Call Routing",
    callRoutingDesc: "How qualified leads get connected — transfers, hours, and closers",
    aiScripts: "AI Scripts",
    aiScriptsDesc: "What the AI says — the main prompt, opener, and scenario-specific scripts",
    transferPhrases: "Transfer Phrases",
    transferPhrasesDesc: "Short messages the caller hears during transfers — usually fine as-is",
    credentials: "Credentials",
    credentialsDesc: "API keys and phone numbers — only change these if you know what you're doing",

    // Business Hours
    businessHours: "Business Hours",
    easternTime: "Eastern Time (EST/EDT)",
    businessHoursDesc: "During these hours, the AI tries to transfer or sends a callback text. Outside these hours, she locks in their info for a morning callback.",

    // Closer Numbers
    closerNumbers: "Closer Numbers",
    closerNumbersDesc: "Priority order. AI tries #1 first — no answer within 15s moves to #2, and so on.",
    addCloser: "+ Add closer",
    remove: "Remove",

    // Opener
    opener: "Opener",
    openerDesc: "The first thing the AI says when she picks up.",
    aiSpeaksFirst: "AI speaks first",
    aiSpeaksFirstDesc: "When on, the AI says the opener immediately. When off, she waits for the caller to speak first.",

    // Main Script
    mainScript: "Main Script",
    mainScriptDesc: "The core instructions the AI follows on every call — qualification, objections, tone, compliance.",
    autoSaves: "Auto-saves",
    characters: "characters",

    // Scenario A
    scenarioATitle: "Scenario A — Advisors Busy",
    scenarioADesc: "What the AI says when all advisors are busy during business hours. She delivers this then sends a callback text.",

    // Scenario B
    scenarioBTitle: "Scenario B — After Hours",
    scenarioBDesc: "What the AI says when a qualified lead calls outside business hours. She locks in their info and asks morning or afternoon.",

    // Transfer Phrases
    connectingMsg: "Connecting Message",
    connectingMsgDesc: "What the caller hears right before being connected to a closer.",
    retryMsg: "Retry Message",
    retryMsgDesc: "What the caller hears when the first closer doesn't answer and we try the next one.",
    scenarioAOpener: "Scenario A Opener",
    scenarioAOpenerDesc: "The first thing the AI says when no closer answered and she switches to the callback flow.",
    errorFallback: "Error Fallback",
    errorFallbackDesc: "Last resort message if the entire transfer system fails. The caller hears this before the call ends.",

    // Script Editor
    aiPowered: "AI-Powered",
    scriptEditorTitle: "Script Editor",
    scriptEditorDesc: "Tell me what you want to change. I'll give you the exact text to paste into Settings.",
    whatToChange: "What do you want to change?",
    scriptEditorContext: "I know the AI's current scripts, variables, tools, and voice AI best practices. Just tell me what you need.",
    tellMeWhatToChange: "Tell me what to change...",
    send: "Send",
    writing: "Writing...",
    shiftEnter: "Shift+Enter for new line",
    clearChat: "Clear chat",
    scriptReadyToPaste: "Script — ready to paste",
    copy: "Copy",
    copiedToClipboard: "Copied to clipboard",

    // Suggestions
    sug1: "Rewrite the opener to sound more casual and warm",
    sug2: "Make the qualification flow feel less like an interrogation",
    sug3: "Add an objection for when they say they already have solar panels",
    sug4: "Rewrite Scenario A so it doesn't sound like a monologue",
    sug5: "Show me the current script and tell me what could be better",
    sug6: "Make the AI more confident when closing qualified leads",

    // Silence Detection
    silenceDetection: "Silence Detection",
    silenceDetectionDesc: "What happens when the caller goes quiet. Handled at the audio level — works even with background noise.",
    firstCheckIn: "First check-in",
    finalWarning: "Final warning",
    after: "after",
    secondsOfSilence: "seconds of silence",
    moreSeconds: "more seconds",
    hangUpAfterThis: "the AI hangs up after this if there's still no response",
    noiseSensitivity: "Noise sensitivity",
    moreNoise: "More sensitive",
    lessNoise: "Less sensitive",

    // Days
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",

    // Toast
    savedLive: "Saved — live on next call",
    errorSaving: "Error saving settings",
  },

  pt: {
    // Sidebar
    voiceAi: "novastructa.com",
    callLog: "Registro de Chamadas",
    settings: "Configuracoes",
    scriptEditor: "Editor de Script",
    agentOnline: "Agente online",
    lightMode: "Modo claro",
    darkMode: "Modo escuro",

    // Call Log
    inboundVoice: "Chamadas Recebidas",
    callLogTitle: "Registro de Chamadas",
    all: "Todas",
    transferred: "Transferida",
    booked: "Agendada",
    callback: "Retorno",
    afterHours: "Fora do Horario",
    disqualified: "Desqualificada",
    dropped: "Desistencia",
    today: "Hoje",
    custom: "Personalizado",
    total: "Total",
    noCallsMatch: "Nenhuma chamada encontrada com esse filtro",
    callSummary: "Resumo da Chamada",
    noSummary: "Resumo indisponivel",
    recording: "Gravacao",
    noRecording: "Gravacao indisponivel",
    openInGhl: "Abrir no GHL",
    clickStartDate: "Selecione a data inicial",
    clickEndDate: "Agora selecione a data final",
    rangeSelected: "Periodo selecionado",
    yesterday: "Ontem",

    // Settings
    configuration: "Configuracao",
    settingsTitle: "Configuracoes",
    settingsDesc: "As alteracoes sao salvas automaticamente e aplicadas na proxima chamada.",
    saving: "Salvando...",

    // Section titles
    callRouting: "Roteamento de Chamadas",
    callRoutingDesc: "Como os leads qualificados sao conectados — transferencias, horarios e closers",
    aiScripts: "Scripts da IA",
    aiScriptsDesc: "O que the AI diz — o prompt principal, abertura e scripts de cenario",
    transferPhrases: "Frases de Transferencia",
    transferPhrasesDesc: "Mensagens curtas que o lead ouve durante transferencias — geralmente nao precisam de ajuste",
    credentials: "Credenciais",
    credentialsDesc: "Chaves de API e numeros de telefone — so altere se souber o que esta fazendo",

    // Business Hours
    businessHours: "Horario Comercial",
    easternTime: "Fuso Horario Leste (EST/EDT)",
    businessHoursDesc: "Nesse horario, the AI tenta transferir ou envia um texto de retorno. Fora desse horario, ela registra as informacoes para retorno pela manha.",

    // Closer Numbers
    closerNumbers: "Numeros dos Closers",
    closerNumbersDesc: "Ordem de prioridade. A IA tenta o #1 primeiro — sem resposta em 15s passa para o #2.",
    addCloser: "+ Adicionar closer",
    remove: "Remover",

    // Opener
    opener: "Abertura",
    openerDesc: "A primeira coisa que the AI diz ao atender.",
    aiSpeaksFirst: "IA fala primeiro",
    aiSpeaksFirstDesc: "Quando ativado, the AI fala a abertura imediatamente. Quando desativado, ela espera o lead falar primeiro.",

    // Main Script
    mainScript: "Script Principal",
    mainScriptDesc: "As instrucoes principais que the AI segue em cada chamada — qualificacao, objecoes, tom, conformidade.",
    autoSaves: "Salva automaticamente",
    characters: "caracteres",

    // Scenario A
    scenarioATitle: "Cenario A — Consultores Ocupados",
    scenarioADesc: "O que the AI diz quando todos os consultores estao ocupados durante o horario comercial. Ela entrega o script e envia um texto de retorno.",

    // Scenario B
    scenarioBTitle: "Cenario B — Fora do Horario",
    scenarioBDesc: "O que the AI diz quando um lead qualificado liga fora do horario. Ela registra as informacoes e pergunta manha ou tarde.",

    // Transfer Phrases
    connectingMsg: "Mensagem de Conexao",
    connectingMsgDesc: "O que o lead ouve antes de ser conectado ao closer.",
    retryMsg: "Mensagem de Tentativa",
    retryMsgDesc: "O que o lead ouve quando o primeiro closer nao atende e tentamos o proximo.",
    scenarioAOpener: "Abertura do Cenario A",
    scenarioAOpenerDesc: "A primeira coisa que the AI diz quando nenhum closer atendeu e ela muda para o fluxo de retorno.",
    errorFallback: "Mensagem de Erro",
    errorFallbackDesc: "Ultimo recurso se todo o sistema de transferencia falhar. O lead ouve isso antes da chamada encerrar.",

    // Script Editor
    aiPowered: "Com IA",
    scriptEditorTitle: "Editor de Script",
    scriptEditorDesc: "Me diga o que voce quer mudar. Eu dou o texto exato pra colar nas Configuracoes.",
    whatToChange: "O que voce quer mudar?",
    scriptEditorContext: "Eu conheco os scripts atuais da the AI, variaveis, ferramentas e melhores praticas de voz IA. So me diga o que precisa.",
    tellMeWhatToChange: "Me diga o que mudar...",
    send: "Enviar",
    writing: "Escrevendo...",
    shiftEnter: "Shift+Enter para nova linha",
    clearChat: "Limpar chat",
    scriptReadyToPaste: "Script — pronto pra colar",
    copy: "Copiar",
    copiedToClipboard: "Copiado",

    // Suggestions
    sug1: "Reescreva a abertura pra soar mais casual e calorosa",
    sug2: "Faca o fluxo de qualificacao parecer menos um interrogatorio",
    sug3: "Adicione uma objecao pra quando dizem que ja tem paineis solares",
    sug4: "Reescreva o Cenario A pra nao parecer um monologo",
    sug5: "Me mostre o script atual e diga o que pode melhorar",
    sug6: "Faca the AI mais confiante no fechamento com leads qualificados",

    // Silence Detection
    silenceDetection: "Deteccao de Silencio",
    silenceDetectionDesc: "O que acontece quando o lead fica em silencio. Funciona no nivel de audio — funciona mesmo com ruido de fundo.",
    firstCheckIn: "Primeira verificacao",
    finalWarning: "Aviso final",
    after: "apos",
    secondsOfSilence: "segundos de silencio",
    moreSeconds: "segundos a mais",
    hangUpAfterThis: "the AI encerra a chamada se ainda nao houver resposta",
    noiseSensitivity: "Sensibilidade ao ruido",
    moreNoise: "Mais sensivel",
    lessNoise: "Menos sensivel",

    // Days
    mon: "Seg", tue: "Ter", wed: "Qua", thu: "Qui", fri: "Sex", sat: "Sab", sun: "Dom",

    // Toast
    savedLive: "Salvo — ativo na proxima chamada",
    errorSaving: "Erro ao salvar configuracoes",
  },
};

export type Translations = typeof translations.en;

const I18nContext = createContext<{
  t: Translations;
  lang: Lang;
  setLang: (l: Lang) => void;
}>({
  t: translations.en,
  lang: "en",
  setLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("lang") as Lang | null;
    if (stored && (stored === "en" || stored === "pt")) {
      setLangState(stored);
    }
    setMounted(true);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem("lang", l);
  }

  // Prevent hydration mismatch by using default lang until mounted
  const t = translations[mounted ? lang : "en"];

  return (
    <I18nContext.Provider value={{ t, lang: mounted ? lang : "en", setLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
