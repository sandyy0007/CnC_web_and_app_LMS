'use client';

import {
  GraduationCap,
  MessageSquare,
  Search,
  Send,
  Users,
} from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format';

interface Student {
  id: string;
  name: string;
  email: string;
  batchId: string;
  batchName: string;
  departmentName: string;
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

export default function TrainerChatPage() {
  const [students, setStudents] = React.useState<Student[]>([]);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeStudent, setActiveStudent] = React.useState<Student | null>(null);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputMessage, setInputMessage] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [loadingInitial, setLoadingInitial] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'recent' | 'students'>('recent');

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Load students and conversations
  const loadSidebar = React.useCallback(async () => {
    try {
      const [studentsRes, convRes] = await Promise.all([
        api.get<any>('/trainer/chat/students'),
        api.get<any>('/trainer/chat/conversations'),
      ]);
      const studentList: Student[] = studentsRes?.students ?? studentsRes?.data?.students ?? [];
      const convList: Conversation[] = convRes?.conversations ?? convRes?.data?.conversations ?? [];
      setStudents(studentList);
      setConversations(convList);
      return { studentList, convList };
    } catch {
      return { studentList: [], convList: [] };
    }
  }, []);

  // Initial load
  React.useEffect(() => {
    loadSidebar().then(({ studentList, convList }) => {
      setLoadingInitial(false);
      if (convList.length > 0) {
        const firstConv = convList[0];
        setActiveConversationId(firstConv.conversationId);
        const matchingStudent = studentList.find((s) => s.id === firstConv.participant.id);
        if (matchingStudent) {
          setActiveStudent(matchingStudent);
        } else {
          setActiveStudent({
            id: firstConv.participant.id,
            name: firstConv.participant.name,
            email: firstConv.participant.email,
            batchId: '',
            batchName: 'Assigned Batch',
            departmentName: 'Department',
          });
        }
      } else if (studentList.length > 0) {
        setActiveStudent(studentList[0]);
      }
    });
  }, [loadSidebar]);

  // Load messages for active conversation
  const loadMessages = React.useCallback(async (conversationId: string) => {
    try {
      const res = await api.get<any>(`/trainer/chat/conversations/${conversationId}/messages`);
      const msgList: Message[] = res?.messages ?? res?.data?.messages ?? [];
      setMessages(msgList);
      // Mark as read
      await api.post(`/trainer/chat/conversations/${conversationId}/read`);
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

  // Scroll to bottom
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Select student
  const handleSelectStudent = (student: Student) => {
    setActiveStudent(student);
    const existing = conversations.find((c) => c.participant.id === student.id);
    if (existing) {
      setActiveConversationId(existing.conversationId);
    } else {
      setActiveConversationId(null);
      setMessages([]);
    }
  };

  // Select conversation
  const handleSelectConversation = (conv: Conversation) => {
    setActiveConversationId(conv.conversationId);
    const matchingStudent = students.find((s) => s.id === conv.participant.id);
    if (matchingStudent) {
      setActiveStudent(matchingStudent);
    } else {
      setActiveStudent({
        id: conv.participant.id,
        name: conv.participant.name,
        email: conv.participant.email,
        batchId: '',
        batchName: 'Enrolled Batch',
        departmentName: 'Student',
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
      if (!targetConvId && activeStudent) {
        targetConvId = activeStudent.id;
      }
      if (!targetConvId) return;

      const sentMsg = await api.post<any>(`/trainer/chat/conversations/${targetConvId}/messages`, {
        content: inputMessage.trim(),
      });
      setInputMessage('');

      const created: Message = sentMsg?.data ?? sentMsg;
      if (created?.id) {
        setMessages((prev) => [...prev, created]);
      }

      const { convList } = await loadSidebar();
      if (!activeConversationId && activeStudent) {
        const found = convList.find((c) => c.participant.id === activeStudent.id);
        if (found) {
          setActiveConversationId(found.conversationId);
        }
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  // Filtering
  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.batchName.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
  );

  const filteredConversations = conversations.filter(
    (c) =>
      c.participant.name.toLowerCase().includes(search.toLowerCase()) ||
      c.participant.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Messages & Inquiries"
        description="Direct communication with students across your assigned batches for doubt-solving, project reviews, and feedback."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="indigo" dot>
              {students.length} Students in Scope
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[720px]">
        {/* Left Column: Conversations & Batch Students */}
        <div className="lg:col-span-4 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {/* Search bar */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search students or batches…"
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-hidden focus:ring-1 focus:ring-indigo"
              />
            </div>
          </div>

          {/* Tab buttons */}
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
              Chats
              {conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0) > 0 && (
                <span className="size-2 rounded-full bg-rose-500" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('students')}
              className={cn(
                'flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5',
                activeTab === 'students'
                  ? 'bg-white dark:bg-slate-800 text-indigo shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              )}
            >
              <Users className="size-3.5" />
              Batch Students ({students.length})
            </button>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-2 space-y-1">
            {loadingInitial ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading students…</div>
            ) : activeTab === 'recent' ? (
              filteredConversations.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageSquare className="size-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No active chats</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Select a student from the Batch Students list to start answering doubts.
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
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
                      <div className="size-10 rounded-full bg-gradient-to-tr from-sky-400 to-indigo text-white flex items-center justify-center font-bold text-sm shrink-0">
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
                        <span className="size-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })
              )
            ) : filteredStudents.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="size-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No students found</p>
              </div>
            ) : (
              filteredStudents.map((student) => {
                const isSelected = activeStudent?.id === student.id;
                return (
                  <button
                    key={student.id}
                    onClick={() => handleSelectStudent(student)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg transition-all flex items-start gap-3',
                      isSelected
                        ? 'bg-indigo/10 dark:bg-indigo/20 border border-indigo/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                    )}
                  >
                    <div className="size-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-sm shrink-0">
                      {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {student.name}
                        </span>
                        <Badge tone="neutral">
                          {student.batchName}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {student.email}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Chat History & Reply */}
        <div className="lg:col-span-8 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {activeStudent ? (
            <>
              {/* Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-gradient-to-tr from-sky-400 to-indigo text-white flex items-center justify-center font-bold text-sm shadow-sm">
                    {activeStudent.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-slate-900 dark:text-white text-base">
                        {activeStudent.name}
                      </h2>
                      <Badge tone="neutral">
                        {activeStudent.batchName}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {activeStudent.email} {activeStudent.departmentName ? `· ${activeStudent.departmentName}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <GraduationCap className="size-3.5 text-indigo" />
                  <span>Enrolled Student</span>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30 dark:bg-slate-950/10">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className="size-12 rounded-full bg-indigo/10 text-indigo flex items-center justify-center mb-3">
                      <MessageSquare className="size-6" />
                    </div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-base">
                      No message history with {activeStudent.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                      Send a message to follow up with the student on assignment submissions or project updates.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.senderRole === 'TRAINER';
                    return (
                      <div
                        key={msg.id}
                        className={cn('flex flex-col', isMe ? 'items-end' : 'items-start')}
                      >
                        <div className="flex items-end gap-2 max-w-[80%]">
                          {!isMe && (
                            <div className="size-7 rounded-full bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold text-xs flex items-center justify-center shrink-0 mb-1">
                              {activeStudent.name.charAt(0)}
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

              {/* Composer */}
              <form
                onSubmit={handleSend}
                className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={`Reply to ${activeStudent.name}…`}
                  className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 focus:outline-hidden focus:ring-2 focus:ring-indigo text-slate-900 dark:text-white placeholder:text-slate-400"
                />
                <Button
                  type="submit"
                  disabled={!inputMessage.trim() || sending}
                  variant="primary"
                  className="px-4 py-2.5 flex items-center gap-1.5"
                >
                  <Send className="size-4" />
                  <span className="hidden sm:inline">Reply</span>
                </Button>
              </form>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="size-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                <MessageSquare className="size-8" />
              </div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-base">
                No student selected
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                Select a student from the sidebar to inspect conversations or send a direct follow-up message.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
