'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  ScreenShare,
  StopCircle,
  Hand,
  MessageSquare,
  Users,
  LogOut,
  Settings,
  Shield,
  Send,
  X,
  Radio,
  Clock,
  VolumeX,
} from 'lucide-react';
import { liveClassApi, LiveClass } from '@/lib/api/live-classroom';
import { api, getAccessToken } from '@/lib/api';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';

interface PeerMeta {
  peerId: string;
  userName: string;
  role: string;
  isHost: boolean;
  handRaised?: boolean;
}

interface ChatMessage {
  id: string;
  senderName: string;
  senderRole: string;
  message: string;
  timestamp: string;
  isMe?: boolean;
}

export default function LiveClassRoomPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params?.id as string;

  // Class & user state
  const [liveClass, setLiveClass] = useState<LiveClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  // Audio/Video/Screen state
  const [micActive, setMicActive] = useState(false);
  const [videoActive, setVideoActive] = useState(false);
  const [screenActive, setScreenActive] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  // Side panels
  const [activeDrawer, setActiveDrawer] = useState<'chat' | 'participants' | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Peers & Chat
  const [peers, setPeers] = useState<PeerMeta[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Media streams & WebRTC references
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const myPeerIdRef = useRef<string>('');

  // 1. Fetch Class Details & Verify Access
  useEffect(() => {
    let mounted = true;
    async function initClass() {
      try {
        setLoading(true);
        const data = await liveClassApi.getLiveClass(classId);
        if (!mounted) return;
        setLiveClass(data);

        // Check if external provider
        if (data.provider !== 'WINNERS_CREEK' && data.meetingUrl) {
          window.location.href = data.meetingUrl;
          return;
        }

        // Register join
        await liveClassApi.joinClass(classId);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.response?.data?.message || err?.message || 'Access denied or class not found.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (classId) {
      initClass();
    }

    return () => {
      mounted = false;
    };
  }, [classId]);

  // 2. Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format elapsed timer
  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${(mins % 60).toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 3. Heartbeat Anti-Cheat Loop (every 20s)
  useEffect(() => {
    if (!classId || error) return;
    const interval = setInterval(() => {
      liveClassApi
        .sendHeartbeat(classId, {
          audioActive: micActive,
          videoActive: videoActive,
          screenShareActive: screenActive,
        })
        .catch(() => {});
    }, 20000);

    return () => clearInterval(interval);
  }, [classId, micActive, videoActive, screenActive, error]);

  // 4. WebSocket Signaling & WebRTC Management
  useEffect(() => {
    if (!classId || error || loading) return;

    let token = getAccessToken();
    if (!token) {
      api.refresh().then((t) => {
        if (!t) {
          setError('Missing authentication token.');
        }
      });
      token = getAccessToken();
    }
    if (!token) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use API port or current host
    const wsUrl = `${protocol}//${window.location.hostname}:8000/api/v1/live-classes/ws/${classId}?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[LiveClass] WebSocket signaling connected');
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'room_state') {
          myPeerIdRef.current = msg.myPeerId;
          const otherPeers = (msg.peers || []).filter((p: PeerMeta) => p.peerId !== msg.myPeerId);
          setPeers(otherPeers);
          const me = (msg.peers || []).find((p: PeerMeta) => p.peerId === msg.myPeerId);
          if (me?.isHost) setIsHost(true);
        } else if (msg.type === 'peer_joined') {
          setPeers((prev) => {
            if (prev.some((p) => p.peerId === msg.peerId)) return prev;
            return [...prev, { peerId: msg.peerId, userName: msg.userName, role: msg.role, isHost: msg.isHost }];
          });
        } else if (msg.type === 'peer_left') {
          setPeers((prev) => prev.filter((p) => p.peerId !== msg.peerId));
          const pc = peerConnections.current.get(msg.peerId);
          if (pc) {
            pc.close();
            peerConnections.current.delete(msg.peerId);
          }
        } else if (msg.type === 'chat') {
          setChatMessages((prev) => [
            ...prev,
            {
              id: Math.random().toString(),
              senderName: msg.senderName,
              senderRole: msg.senderRole,
              message: msg.message,
              timestamp: msg.timestamp,
              isMe: msg.fromPeerId === myPeerIdRef.current,
            },
          ]);
          if (activeDrawer !== 'chat') {
            setUnreadChatCount((c) => c + 1);
          }
        } else if (msg.type === 'hand_raise') {
          setPeers((prev) =>
            prev.map((p) => (p.peerId === msg.peerId ? { ...p, handRaised: msg.handRaised } : p))
          );
        } else if (msg.type === 'host_command' && msg.command === 'mute') {
          // Host ordered mute
          stopMic();
        } else if (msg.type === 'class_ended') {
          alert('This live class has concluded. Your attendance has been recorded.');
          router.push('/student/live-classes');
        }
      } catch (e) {
        console.error('[LiveClass WS] Error parsing message:', e);
      }
    };

    ws.onclose = () => {
      console.log('[LiveClass] WebSocket disconnected');
    };

    const currentPCs = peerConnections.current;

    return () => {
      ws.close();
      currentPCs.forEach((pc) => pc.close());
      currentPCs.clear();
    };
  }, [classId, error, loading, router, activeDrawer]);

  // Leave on unload
  useEffect(() => {
    const handleUnload = () => {
      liveClassApi.leaveClass(classId).catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload();
    };
  }, [classId]);

  // 5. Media Control Handlers
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: micActive });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setVideoActive(true);
    } catch (err) {
      console.warn('Unable to access camera:', err);
      alert('Camera permission denied or device unavailable.');
    }
  };

  const stopCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => track.stop());
    }
    setVideoActive(false);
  };

  const startMic = async () => {
    try {
      if (localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
        localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = true));
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (localStreamRef.current) {
          stream.getAudioTracks().forEach((t) => localStreamRef.current?.addTrack(t));
        } else {
          localStreamRef.current = stream;
        }
      }
      setMicActive(true);
    } catch (err) {
      console.warn('Unable to access microphone:', err);
      alert('Microphone permission denied.');
    }
  };

  const stopMic = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
    }
    setMicActive(false);
  };

  const toggleScreenShare = async () => {
    if (screenActive) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setScreenActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = stream;
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
        }
        setScreenActive(true);
        stream.getVideoTracks()[0].onended = () => {
          setScreenActive(false);
          screenStreamRef.current = null;
        };
      } catch (err) {
        console.warn('Screen share canceled:', err);
      }
    }
  };

  const toggleHandRaise = () => {
    const nextState = !handRaised;
    setHandRaised(nextState);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'raise_hand', raised: nextState }));
    }
  };

  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !wsRef.current) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'chat',
        message: chatInput.trim(),
      })
    );
    setChatInput('');
  };

  const handleEndClass = async () => {
    if (!confirm('Are you sure you want to end this live class? This will finalize all attendance records.')) {
      return;
    }
    try {
      await liveClassApi.endClass(classId);
      alert('Class has ended and attendance finalized.');
      router.push('/trainer/classes');
    } catch (err: any) {
      alert(err?.message || 'Failed to end class');
    }
  };

  const handleLeaveClass = async () => {
    if (confirm('Leave virtual classroom?')) {
      await liveClassApi.leaveClass(classId);
      router.push('/student/live-classes');
    }
  };

  const hostMuteAll = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'host_control', action: 'mute_all' }));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <WinnersCreekLogo variant="full" priority />
          <div className="size-8 animate-spin rounded-full border-3 border-indigo-500 border-t-transparent" />
          <p className="font-medium text-xs text-slate-400">Connecting to Winners Creek Live Classroom...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="max-w-md rounded-2xl border border-red-500/20 bg-slate-900/80 p-6 text-center backdrop-blur-xl">
          <Shield className="mx-auto mb-4 size-12 text-red-400" />
          <h2 className="text-xl font-bold text-white">Access Denied</h2>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <button
            onClick={() => router.push('/student/live-classes')}
            className="mt-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 font-semibold text-white shadow-lg transition hover:brightness-110"
          >
            Return to Live Classes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-white">
      {/* 1. Header Bar */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/60 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-400">
            <Radio className="size-3.5 animate-pulse" />
            LIVE
          </div>
          <h1 className="max-w-md truncate text-base font-bold text-white sm:text-lg">
            {liveClass?.title}
          </h1>
          <span className="hidden text-xs text-slate-400 sm:inline">
            ({liveClass?.batchName || liveClass?.courseMode || 'Cohort'})
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-mono text-slate-300">
            <Clock className="size-3.5 text-indigo-400" />
            {formatTimer(elapsedSeconds)}
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-300">
            <Users className="size-3.5 text-cyan-400" />
            <span>{peers.length + 1} present</span>
          </div>
        </div>
      </header>

      {/* 2. Main Stage Area */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Stage / Video Grid */}
        <div className="relative flex flex-1 flex-col p-4">
          {screenActive ? (
            /* Screen Share Layout */
            <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                className="size-full object-contain"
              />
              <div className="absolute bottom-4 left-4 rounded-lg bg-slate-900/80 px-3 py-1.5 text-xs font-medium backdrop-blur-md">
                Screen Share (You)
              </div>
            </div>
          ) : (
            /* Grid View */
            <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {/* Local User Tile */}
              <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-indigo-950/40 shadow-inner">
                {videoActive ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-xl font-bold shadow-lg shadow-indigo-500/30">
                      You
                    </div>
                    <span className="text-xs text-slate-400">Camera Off</span>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-slate-900/80 px-2.5 py-1 text-xs backdrop-blur-md">
                  <span>You {isHost && '(Host)'}</span>
                  {micActive ? (
                    <Mic className="size-3 text-green-400" />
                  ) : (
                    <MicOff className="size-3 text-red-400" />
                  )}
                  {handRaised && <Hand className="size-3 text-amber-400" />}
                </div>
              </div>

              {/* Remote Peer Tiles */}
              {peers.map((peer) => (
                <div
                  key={peer.peerId}
                  className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex size-16 items-center justify-center rounded-full bg-slate-700 text-xl font-bold text-slate-200">
                      {peer.userName?.slice(0, 2).toUpperCase() || 'ST'}
                    </div>
                    <span className="text-xs text-slate-300">{peer.userName}</span>
                  </div>
                  <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-slate-900/80 px-2.5 py-1 text-xs backdrop-blur-md">
                    <span>{peer.userName}</span>
                    {peer.isHost && (
                      <span className="rounded bg-indigo-500/30 px-1 py-0.5 text-[10px] text-indigo-300">
                        Host
                      </span>
                    )}
                    {peer.handRaised && <Hand className="size-3 animate-bounce text-amber-400" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Sliding Side Drawers (Chat / Participants) */}
        {activeDrawer && (
          <aside className="relative flex w-80 shrink-0 flex-col border-l border-white/10 bg-slate-900/90 backdrop-blur-xl transition-all">
            {/* Drawer Header */}
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
              <h2 className="text-sm font-semibold capitalize text-white">
                {activeDrawer === 'chat' ? 'Live Classroom Chat' : `Participants (${peers.length + 1})`}
              </h2>
              <button
                onClick={() => setActiveDrawer(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Chat Drawer Content */}
            {activeDrawer === 'chat' && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {chatMessages.length === 0 ? (
                    <p className="pt-8 text-center text-xs text-slate-400">
                      No messages yet. Say hello to your cohort!
                    </p>
                  ) : (
                    chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                          <span className="font-medium text-slate-300">{msg.senderName}</span>
                          {msg.senderRole === 'TRAINER' && (
                            <span className="rounded bg-indigo-500/20 px-1 text-[9px] text-indigo-300">
                              Trainer
                            </span>
                          )}
                        </div>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                            msg.isMe
                              ? 'bg-indigo-600 text-white'
                              : 'border border-white/10 bg-slate-800 text-slate-200'
                          }`}
                        >
                          {msg.message}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={sendChatMessage} className="border-t border-white/10 p-3">
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 focus-within:border-indigo-500">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-indigo-600 p-1.5 text-white transition hover:bg-indigo-500 disabled:opacity-40"
                      disabled={!chatInput.trim()}
                    >
                      <Send className="size-3.5" />
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Participants Drawer Content */}
            {activeDrawer === 'participants' && (
              <div className="flex flex-1 flex-col overflow-y-auto p-4">
                {isHost && (
                  <div className="mb-4">
                    <button
                      onClick={hostMuteAll}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
                    >
                      <VolumeX className="size-3.5 text-red-400" />
                      Mute All Participants
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {/* Self */}
                  <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold">
                        You
                      </div>
                      <div>
                        <p className="text-xs font-medium text-white">You {isHost && '(Host)'}</p>
                        <p className="text-[10px] text-slate-400">Active Presence</p>
                      </div>
                    </div>
                    {handRaised && <Hand className="size-4 text-amber-400" />}
                  </div>

                  {/* Remote Peers */}
                  {peers.map((peer) => (
                    <div
                      key={peer.peerId}
                      className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/40 p-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-7 items-center justify-center rounded-full bg-slate-700 text-xs font-bold">
                          {peer.userName?.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-white">{peer.userName}</p>
                          <p className="text-[10px] text-slate-400">
                            {peer.isHost ? 'Host' : 'Student'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {peer.handRaised && <Hand className="size-4 text-amber-400" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* 4. Bottom Controls Bar */}
      <footer className="flex h-20 shrink-0 items-center justify-between border-t border-white/10 bg-slate-900/80 px-6 backdrop-blur-md">
        {/* Left: Device indicators */}
        <div className="hidden items-center gap-2.5 sm:flex">
          <WinnersCreekLogo variant="compact" />
          <span className="text-xs text-slate-400 font-medium">Live Classroom</span>
        </div>

        {/* Center: Essential Meeting Controls */}
        <div className="flex items-center gap-3">
          {/* Mic */}
          <button
            onClick={micActive ? stopMic : startMic}
            className={`flex size-11 items-center justify-center rounded-2xl transition shadow-md ${
              micActive
                ? 'bg-slate-800 text-white hover:bg-slate-700'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
            }`}
            title={micActive ? 'Mute Mic' : 'Unmute Mic'}
          >
            {micActive ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          </button>

          {/* Camera */}
          <button
            onClick={videoActive ? stopCamera : startCamera}
            className={`flex size-11 items-center justify-center rounded-2xl transition shadow-md ${
              videoActive
                ? 'bg-slate-800 text-white hover:bg-slate-700'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
            }`}
            title={videoActive ? 'Turn Camera Off' : 'Turn Camera On'}
          >
            {videoActive ? <VideoIcon className="size-5" /> : <VideoOff className="size-5" />}
          </button>

          {/* Screen Share */}
          <button
            onClick={toggleScreenShare}
            className={`flex size-11 items-center justify-center rounded-2xl transition shadow-md ${
              screenActive
                ? 'bg-cyan-500 text-white shadow-cyan-500/20'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
            title="Share Screen"
          >
            {screenActive ? <StopCircle className="size-5" /> : <ScreenShare className="size-5" />}
          </button>

          {/* Raise Hand */}
          <button
            onClick={toggleHandRaise}
            className={`flex size-11 items-center justify-center rounded-2xl transition shadow-md ${
              handRaised
                ? 'bg-amber-500 text-white shadow-amber-500/20'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
            title="Raise Hand"
          >
            <Hand className="size-5" />
          </button>

          {/* Chat Drawer Toggle */}
          <button
            onClick={() => {
              setActiveDrawer(activeDrawer === 'chat' ? null : 'chat');
              setUnreadChatCount(0);
            }}
            className={`relative flex size-11 items-center justify-center rounded-2xl transition shadow-md ${
              activeDrawer === 'chat'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
            title="Toggle Chat"
          >
            <MessageSquare className="size-5" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Participants Drawer Toggle */}
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'participants' ? null : 'participants')}
            className={`flex size-11 items-center justify-center rounded-2xl transition shadow-md ${
              activeDrawer === 'participants'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
            title="Toggle Participants"
          >
            <Users className="size-5" />
          </button>
        </div>

        {/* Right: Leave / End Actions */}
        <div className="flex items-center gap-3">
          {isHost ? (
            <button
              onClick={handleEndClass}
              className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500"
            >
              <LogOut className="size-4" />
              End Class
            </button>
          ) : (
            <button
              onClick={handleLeaveClass}
              className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-red-600 hover:text-white"
            >
              <LogOut className="size-4" />
              Leave
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
