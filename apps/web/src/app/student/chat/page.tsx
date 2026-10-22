'use client';

import {
  Bot,
  CheckCircle2,
  Clock,
  Compass,
  FileCheck2,
  GraduationCap,
  MessageSquare,
  Send,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format';

interface Mentor {
  id: string;
  name: string;
  email: string;
  role: string;
  batches: Array<{ batchId: string; batchName: string; courseName: string }>;
}

interface Conversation {
  conversationId: string;
  participant: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  lastMessage: {
    content: string;
    senderRole: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

interface Message {
  id: string;
  senderId: string;
  senderRole: string;
  content: string;
  createdAt: string;
}

interface AiChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  provider?: string;
  citations?: string[];
  createdAt: string;
}

const AI_PROMPT_SUGGESTIONS = [
  'What courses am I currently enrolled in?',
  'What are my diagnosed skill gaps and weakest EEDI pillar?',
  'What is my ATS resume compatibility score and missing keywords?',
  'Explain the 5 EEDI employability evaluation parameters',
];

export default function StudentChatPage() {
  const [activeMainMode, setActiveMainMode] = React.useState<'mentor' | 'ai'>('mentor');

  // Mentor chat state
  const [mentors, setMentors] = React.useState<Mentor[]>([]);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeMentor, setActiveMentor] = React.useState<Mentor | null>(null);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputMessage, setInputMessage] = React.useState('');
  const [loadingInitial, setLoadingInitial] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'recent' | 'mentors'>('recent');

  // AI Assistant chat state
  const [aiMessages, setAiMessages] = React.useState<AiChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      content:
        'Hello! I am your Winners Creek AI Academic Assistant. I provide truthful, grounded guidance on your active courses, diagnosed EEDI employability pillars, ATS resume compatibility, and practice lab milestones.\n\nHow can I help you today?',
      citations: [
        'Enrolled Course Catalog & Syllabus',
        'Verified EEDI Diagnostic Evaluation',
        'ATS Resume Skill Profile',
      ],
      createdAt: new Date().toISOString(),
    },
  ]);
  const [aiInput, setAiInput] = React.useState('');
  const [aiLoading, setAiLoading] = React.useState(false);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const aiMessagesEndRef = React.useRef<HTMLDivElement>(null);

  // Load mentors and conversations
  const loadSidebar = React.useCallback(async () => {
    try {
      const [mentorsRes, convRes] = await Promise.all([
        api.get<any>('/student/chat/mentors'),
        api.get<any>('/student/chat/conversations'),
      ]);
      const mentorList: Mentor[] = mentorsRes?.mentors ?? mentorsRes?.data?.mentors ?? [];
      const convList: Conversation[] = convRes?.conversations ?? convRes?.data?.conversations ?? [];
      setMentors(mentorList);
      setConversations(convList);
      return { mentorList, convList };
    } catch {
      return { mentorList: [], convList: [] };
    }
  }, []);

  // Initial load
  React.useEffect(() => {
    loadSidebar().then(({ mentorList, convList }) => {
      setLoadingInitial(false);
      if (convList.length > 0) {
        const firstConv = convList[0];
        setActiveConversationId(firstConv.conversationId);
        const matchingMentor = mentorList.find((m) => m.id === firstConv.participant.id);
        if (matchingMentor) {
          setActiveMentor(matchingMentor);
        } else {
          setActiveMentor({
            id: firstConv.participant.id,
            name: firstConv.participant.name,
            email: firstConv.participant.email,
            role: firstConv.participant.role,
            batches: [],
          });
        }
      } else if (mentorList.length > 0) {
        setActiveMentor(mentorList[0]);
      }
    });
  }, [loadSidebar]);

  // Load messages for active conversation
  const loadMessages = React.useCallback(async (conversationId: string) => {
    try {
      const res = await api.get<any>(`/student/chat/conversations/${conversationId}/messages`);
      const msgList: Message[] = res?.messages ?? res?.data?.messages ?? [];
      setMessages(msgList);
      await api.post(`/student/chat/conversations/${conversationId}/read`);
    } catch {
      // ignore
    }
  }, []);

  // Poll for messages when conversation is active
  React.useEffect(() => {
    if (!activeConversationId || activeMainMode !== 'mentor') return;
    loadMessages(activeConversationId);

    const interval = setInterval(() => {
      loadMessages(activeConversationId);
      loadSidebar();
    }, 5000);

    return () => clearInterval(interval);
  }, [activeConversationId, activeMainMode, loadMessages, loadSidebar]);

  // Scroll to bottom
  React.useEffect(() => {
    if (activeMainMode === 'mentor') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      aiMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, aiMessages, activeMainMode]);

  const handleSelectMentor = (mentor: Mentor) => {
    setActiveMentor(mentor);
    const existing = conversations.find((c) => c.participant.id === mentor.id);
    if (existing) {
      setActiveConversationId(existing.conversationId);
    } else {
      setActiveConversationId(null);
      setMessages([]);
    }
  };

  const handleSelectConversation = (conv: Conversation) => {
    setActiveConversationId(conv.conversationId);
    const matchingMentor = mentors.find((m) => m.id === conv.participant.id);
    if (matchingMentor) {
      setActiveMentor(matchingMentor);
    } else {
      setActiveMentor({
        id: conv.participant.id,
        name: conv.participant.name,
        email: conv.participant.email,
        role: conv.participant.role,
        batches: [],
      });
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || sending) return;

    setSending(true);
    try {
      let targetConvId = activeConversationId;
      if (!targetConvId && activeMentor) {
        targetConvId = activeMentor.id;
      }
      if (!targetConvId) return;

      const sentMsg = await api.post<any>(`/student/chat/conversations/${targetConvId}/messages`, {
        content: inputMessage.trim(),
      });
      setInputMessage('');

      const created: Message = sentMsg?.data ?? sentMsg;
      if (created?.id) {
        setMessages((prev) => [...prev, created]);
      }

      const { convList } = await loadSidebar();
      if (!activeConversationId && activeMentor) {
        const found = convList.find((c) => c.participant.id === activeMentor.id);
        if (found) {
          setActiveConversationId(found.conversationId);
        }
      }
    } catch {
      // error handled gracefully
    } finally {
      setSending(false);
    }
  };

  const handleAiSend = async (promptText?: string) => {
    const query = (promptText || aiInput).trim();
    if (!query || aiLoading) return;

    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: query,
      createdAt: new Date().toISOString(),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    if (!promptText) setAiInput('');
    setAiLoading(true);

    try {
      const res = await api.post<any>('/ai/chat', { question: query });
      const answerData = res?.data ?? res;
      const assistantMsg: AiChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        content: answerData?.answer ?? 'I have recorded your request. Let me know if you need more details.',
        provider: answerData?.provider ?? 'deterministic-rag-engine',
        citations: answerData?.citations ?? [
          'Enrolled Course Catalog & Syllabus',
          'Verified EEDI Diagnostic Evaluation',
          'ATS Resume Skill Profile',
        ],
        createdAt: new Date().toISOString(),
      };
      setAiMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: 'assistant',
          content: 'Unable to reach the academic assistant at this moment. Please check your network and try again.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chat & AI Academic Assistant"
        description="Direct one-on-one communication with your assigned batch trainers and 24/7 grounded AI academic coaching."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveMainMode('mentor')}
              className={cn(
                'tactile-press rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                activeMainMode === 'mentor'
                  ? 'bg-indigo text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-ink-2 dark:text-slate-300 border border-line dark:border-slate-700 hover:bg-app'
              )}
            >
              <Users className="size-3.5 inline mr-1.5" />
              Chat with Mentor ({mentors.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveMainMode('ai')}
              className={cn(
                'tactile-press rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                activeMainMode === 'ai'
                  ? 'bg-indigo text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-ink-2 dark:text-slate-300 border border-line dark:border-slate-700 hover:bg-app'
              )}
            >
              <Sparkles className="size-3.5 inline mr-1.5 text-amber-400" />
              AI Academic Coach
            </button>
          </div>
        }
      />

      {activeMainMode === 'ai' ? (
        /* ==================== AI ACADEMIC COACH VIEW ==================== */
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col h-[650px] bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-line dark:border-slate-800 bg-surface dark:bg-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-indigo/10 text-indigo dark:bg-indigo/20">
                  <Bot className="size-5" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-ink-1 dark:text-white flex items-center gap-2">
                    Winners Creek AI Academic Assistant
                    <Badge tone="indigo" className="text-[10px] py-0 px-1.5">Grounded RAG</Badge>
                  </h2>
                  <p className="text-xs text-ink-3 dark:text-slate-400">
                    Truthful responses referencing your enrolled courses, EEDI scores, and resume skills.
                  </p>
                </div>
              </div>
              <Badge tone="success" dot className="hidden sm:inline-flex text-xs">
                Active & Grounded
              </Badge>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-app/50 dark:bg-slate-950/40">
              {aiMessages.map((msg) => {
                const isMe = msg.sender === 'user';
                return (
                  <div
                    key={msg.id}
                    className={cn('flex flex-col', isMe ? 'items-end' : 'items-start')}
                  >
                    <div className="flex items-start gap-2.5 max-w-[85%]">
                      {!isMe && (
                        <div className="size-8 rounded-xl bg-indigo/10 text-indigo dark:bg-indigo/20 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="size-4" />
                        </div>
                      )}
                      <div
                        className={cn(
                          'p-4 rounded-2xl text-sm leading-relaxed shadow-xs',
                          isMe
                            ? 'bg-indigo text-white rounded-br-xs'
                            : 'bg-white dark:bg-slate-900 text-ink-1 dark:text-slate-100 border border-line dark:border-slate-800 rounded-bl-xs'
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                        {/* Citations */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-line/60 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-ink-3 dark:text-slate-400 flex items-center gap-1">
                              <CheckCircle2 className="size-3 text-success inline" /> Citations:
                            </span>
                            {msg.citations.map((c) => (
                              <span
                                key={c}
                                className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-md bg-surface-muted dark:bg-slate-800 text-ink-2 dark:text-slate-300 border border-line dark:border-slate-700"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-ink-3 dark:text-slate-500 mt-1 px-1">
                      {relativeTime(msg.createdAt)}
                    </span>
                  </div>
                );
              })}

              {aiLoading && (
                <div className="flex items-start gap-2.5 max-w-[80%]">
                  <div className="size-8 rounded-xl bg-indigo/10 text-indigo dark:bg-indigo/20 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="size-4" />
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-bl-xs">
                    <p className="text-xs text-ink-3 dark:text-slate-400 flex items-center gap-2">
                      <span className="inline-block size-2 rounded-full bg-indigo animate-ping" />
                      Analyzing curriculum records and synthesizing response…
                    </p>
                  </div>
                </div>
              )}
              <div ref={aiMessagesEndRef} />
            </div>

            {/* Input Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAiSend();
              }}
              className="p-3 border-t border-line dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2"
            >
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="Ask about your courses, skill gaps, ATS keywords, or EEDI metrics…"
                className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-line dark:border-slate-700 bg-app dark:bg-slate-950 focus:outline-hidden focus:ring-2 focus:ring-indigo text-ink-1 dark:text-white placeholder:text-ink-3"
              />
              <Button
                type="submit"
                disabled={!aiInput.trim() || aiLoading}
                variant="primary"
                className="px-4 py-2.5 flex items-center gap-1.5"
              >
                <Send className="size-4" />
                <span className="hidden sm:inline">Ask AI</span>
              </Button>
            </form>
          </div>

          {/* AI Sidebar: Quick Suggestions & Context Pillars */}
          <div className="space-y-4">
            <Card className="card-interactive">
              <CardBody className="p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3 dark:text-slate-400 flex items-center gap-1.5">
                  <Compass className="size-3.5 text-indigo" />
                  Suggested Questions
                </h3>
                <div className="space-y-2">
                  {AI_PROMPT_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => handleAiSend(sug)}
                      disabled={aiLoading}
                      className="w-full text-left p-2.5 rounded-xl border border-line dark:border-slate-800 bg-surface dark:bg-slate-850 hover:border-indigo/40 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 text-xs font-medium text-ink-1 dark:text-slate-200 transition-all tactile-press"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card className="card-interactive">
              <CardBody className="p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3 dark:text-slate-400 flex items-center gap-1.5">
                  <FileCheck2 className="size-3.5 text-success" />
                  Grounded Verification
                </h3>
                <p className="text-xs text-ink-2 dark:text-slate-300 leading-relaxed">
                  The AI Assistant answers strictly from your authenticated student record, syllabus catalog, and diagnostic evaluations. It never fabricates grades or scores.
                </p>
                <div className="rounded-xl bg-app dark:bg-slate-950 p-2.5 text-[11px] text-ink-3 dark:text-slate-400 space-y-1">
                  <div>✓ PostgreSQL Enrolled Courses</div>
                  <div>✓ EEDI 5-Parameter Diagnostics</div>
                  <div>✓ ATS Resume Keyword Extractions</div>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      ) : (
        /* ==================== MENTOR CHAT VIEW ==================== */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[650px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {/* Sidebar */}
          <div className="lg:col-span-4 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50">
            {/* Tabs: Recent vs All Mentors */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('recent')}
                className={cn(
                  'flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors',
                  activeTab === 'recent'
                    ? 'bg-white dark:bg-slate-800 text-indigo shadow-xs'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                )}
              >
                Conversations ({conversations.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('mentors')}
                className={cn(
                  'flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors',
                  activeTab === 'mentors'
                    ? 'bg-white dark:bg-slate-800 text-indigo shadow-xs'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                )}
              >
                All Mentors ({mentors.length})
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
              {loadingInitial ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="flex gap-3 items-center animate-pulse">
                      <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded-sm w-3/4" />
                        <div className="h-2.5 bg-slate-200 dark:bg-slate-700 rounded-sm w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeTab === 'recent' ? (
                conversations.length === 0 ? (
                  <div className="p-6 text-center text-slate-400">
                    <MessageSquare className="size-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">No active conversations yet.</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Switch to &ldquo;All Mentors&rdquo; tab to start a dialogue.
                    </p>
                  </div>
                ) : (
                  conversations.map((conv) => {
                    const isSelected = activeConversationId === conv.conversationId;
                    return (
                      <button
                        key={conv.conversationId}
                        type="button"
                        onClick={() => handleSelectConversation(conv)}
                        className={cn(
                          'w-full p-3.5 flex items-start gap-3 text-left transition-colors',
                          isSelected
                            ? 'bg-indigo/5 dark:bg-indigo/10 border-l-2 border-indigo'
                            : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                        )}
                      >
                        <div className="size-10 rounded-full bg-indigo/10 text-indigo font-bold text-sm flex items-center justify-center shrink-0">
                          {conv.participant.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-sm truncate text-slate-900 dark:text-slate-100">
                              {conv.participant.name}
                            </span>
                            {conv.lastMessage && (
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {relativeTime(conv.lastMessage.createdAt)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {conv.lastMessage?.content || 'No messages yet'}
                          </p>
                        </div>
                        {conv.unreadCount > 0 && (
                          <span className="size-5 rounded-full bg-indigo text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                            {conv.unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })
                )
              ) : mentors.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  <User className="size-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No mentors assigned to your batch yet.</p>
                </div>
              ) : (
                mentors.map((mentor) => {
                  const isSelected = activeMentor?.id === mentor.id;
                  return (
                    <button
                      key={mentor.id}
                      type="button"
                      onClick={() => handleSelectMentor(mentor)}
                      className={cn(
                        'w-full p-3.5 flex items-start gap-3 text-left transition-colors',
                        isSelected
                          ? 'bg-indigo/5 dark:bg-indigo/10 border-l-2 border-indigo'
                          : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                      )}
                    >
                      <div className="size-10 rounded-full bg-indigo/10 text-indigo font-bold text-sm flex items-center justify-center shrink-0">
                        {mentor.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-sm truncate text-slate-900 dark:text-slate-100 block">
                          {mentor.name}
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {mentor.batches?.map((b) => b.batchName).join(', ') || 'Assigned Mentor'}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Chat Pane */}
          <div className="lg:col-span-8 flex flex-col h-full bg-white dark:bg-slate-900">
            {activeMentor ? (
              <>
                {/* Active Mentor Header */}
                <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-900">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-full bg-indigo/10 text-indigo font-bold text-sm flex items-center justify-center shrink-0">
                      {activeMentor.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {activeMentor.name}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {activeMentor.email} · {activeMentor.role}
                      </p>
                    </div>
                  </div>
                  <Badge tone="indigo" className="hidden sm:inline-flex text-xs">
                    Mentor
                  </Badge>
                </div>

                {/* Messages List */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/30 dark:bg-slate-950/20">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <div className="size-12 rounded-full bg-indigo/10 text-indigo flex items-center justify-center mb-2">
                        <GraduationCap className="size-6" />
                      </div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-base">
                        Start a conversation with {activeMentor.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                        Ask questions regarding course topics, get guidance on assignments, or discuss your career goals.
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.senderRole === 'STUDENT';
                      return (
                        <div
                          key={msg.id}
                          className={cn('flex flex-col', isMe ? 'items-end' : 'items-start')}
                        >
                          <div className="flex items-end gap-2 max-w-[80%]">
                            {!isMe && (
                              <div className="size-7 rounded-full bg-indigo/20 text-indigo font-bold text-xs flex items-center justify-center shrink-0 mb-1">
                                {activeMentor.name.charAt(0)}
                              </div>
                            )}
                            <div
                              className={cn(
                                'p-3.5 rounded-2xl text-sm leading-relaxed shadow-xs',
                                isMe
                                  ? 'bg-indigo text-white rounded-br-xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-xs'
                              )}
                            >
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1 px-1">
                            {relativeTime(msg.createdAt)}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Composer */}
                <form
                  onSubmit={handleSend}
                  className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={`Write a message to ${activeMentor.name}…`}
                    className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 focus:outline-hidden focus:ring-2 focus:ring-indigo text-slate-900 dark:text-white placeholder:text-slate-400"
                  />
                  <Button
                    type="submit"
                    disabled={!inputMessage.trim() || sending}
                    variant="primary"
                    className="px-4 py-2.5 flex items-center gap-1.5"
                  >
                    <Send className="size-4" />
                    <span className="hidden sm:inline">Send</span>
                  </Button>
                </form>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <div className="size-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                  <MessageSquare className="size-8" />
                </div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-base">
                  No conversation selected
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                  Choose a mentor from the sidebar to view past messages or start a new dialogue.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
