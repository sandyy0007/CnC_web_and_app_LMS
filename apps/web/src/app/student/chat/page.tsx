'use client';

import {
  Clock,
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

export default function StudentChatPage() {
  const [mentors, setMentors] = React.useState<Mentor[]>([]);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeMentor, setActiveMentor] = React.useState<Mentor | null>(null);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputMessage, setInputMessage] = React.useState('');
  const [loadingInitial, setLoadingInitial] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'recent' | 'mentors'>('recent');

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

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
      // Auto-select first conversation or first mentor if available
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
      // Mark as read
      await api.post(`/student/chat/conversations/${conversationId}/read`);
    } catch {
      // ignore
    }
  }, []);

  // Poll for messages when conversation is active
  React.useEffect(() => {
    if (!activeConversationId) return;
    loadMessages(activeConversationId);

    const interval = setInterval(() => {
      loadMessages(activeConversationId);
      loadSidebar();
    }, 5000);

    return () => clearInterval(interval);
  }, [activeConversationId, loadMessages, loadSidebar]);

  // Scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Select a mentor: find existing conversation or prepare new one
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

  // Select a conversation directly
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

  // Send message
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || sending) return;

    setSending(true);
    try {
      let targetConvId = activeConversationId;
      // If no conversation yet, start one with mentor.id as conversationId
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

      // Refresh conversations list to update ordering & last message
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mentor Chat"
        description="Direct one-on-one communication with your assigned batch trainers and mentors."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="indigo" dot>
              {mentors.length} Mentors Assigned
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[720px]">
        {/* Left Sidebar: Mentors & Active Chats */}
        <div className="lg:col-span-4 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 p-2 gap-1 bg-slate-50/70 dark:bg-slate-950/40">
            <button
              onClick={() => setActiveTab('recent')}
              className={cn(
                'flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5',
                activeTab === 'recent'
                  ? 'bg-white dark:bg-slate-800 text-indigo shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              )}
            >
              <MessageSquare className="size-3.5" />
              Conversations
              {conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0) > 0 && (
                <span className="size-2 rounded-full bg-rose-500" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('mentors')}
              className={cn(
                'flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5',
                activeTab === 'mentors'
                  ? 'bg-white dark:bg-slate-800 text-indigo shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              )}
            >
              <GraduationCap className="size-3.5" />
              All Mentors ({mentors.length})
            </button>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-2 space-y-1">
            {loadingInitial ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading mentors…</div>
            ) : activeTab === 'recent' ? (
              conversations.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageSquare className="size-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No conversations yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Select a mentor from the &quot;All Mentors&quot; tab to ask questions or get feedback.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3 text-xs"
                    onClick={() => setActiveTab('mentors')}
                  >
                    View Mentors
                  </Button>
                </div>
              ) : (
                conversations.map((conv) => {
                  const isSelected = activeConversationId === conv.conversationId;
                  return (
                    <button
                      key={conv.conversationId}
                      onClick={() => handleSelectConversation(conv)}
                      className={cn(
                        'w-full text-left p-3 rounded-lg transition-all flex items-start gap-3 relative',
                        isSelected
                          ? 'bg-indigo/10 dark:bg-indigo/20 border border-indigo/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                      )}
                    >
                      <div className="size-10 rounded-full bg-gradient-to-tr from-indigo/30 to-violet-500/30 flex items-center justify-center text-indigo font-bold text-sm shrink-0">
                        {conv.participant.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
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
              <div className="p-8 text-center">
                <Users className="size-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No assigned mentors</p>
                <p className="text-xs text-slate-500 mt-1">
                  Once your batch is assigned a trainer, they will appear here.
                </p>
              </div>
            ) : (
              mentors.map((mentor) => {
                const isSelected = activeMentor?.id === mentor.id;
                return (
                  <button
                    key={mentor.id}
                    onClick={() => handleSelectMentor(mentor)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg transition-all flex items-start gap-3',
                      isSelected
                        ? 'bg-indigo/10 dark:bg-indigo/20 border border-indigo/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                    )}
                  >
                    <div className="size-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
                      {mentor.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {mentor.name}
                        </span>
                        <Badge tone="success">Mentor</Badge>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {mentor.batches.map((b) => b.batchName).join(', ') || mentor.email}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Message Thread & Composer */}
        <div className="lg:col-span-8 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {activeMentor ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-gradient-to-tr from-indigo to-violet-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                    {activeMentor.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-slate-900 dark:text-white text-base">
                        {activeMentor.name}
                      </h2>
                      <Badge tone="indigo">
                        Mentor
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {activeMentor.batches.map((b) => b.batchName).join(' · ') || activeMentor.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Sparkles className="size-3.5 text-amber-500" />
                  <span>Verified Trainer</span>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30 dark:bg-slate-950/10">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className="size-12 rounded-full bg-indigo/10 text-indigo flex items-center justify-center mb-3">
                      <MessageSquare className="size-6" />
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
    </div>
  );
}
