/**
 * Client API for Winners Creek Live Class & Virtual Classroom System.
 */

export interface LiveClass {
  id: string;
  title: string;
  description?: string;
  meetingType: 'CLASS_SESSION' | 'TRAINER_MEETING';
  provider: 'WINNERS_CREEK' | 'GOOGLE_MEET' | 'ZOOM' | 'TEAMS' | 'EXTERNAL';
  roomId?: string;
  courseId?: string;
  courseMode: 'ONLINE' | 'OFFLINE';
  collegeId?: string;
  departmentId?: string;
  batchId?: string;
  batchName?: string;
  trainerUserId?: string;
  trainerName?: string;
  meetingUrl?: string;
  passcode?: string;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
  attendanceThreshold: number;
  attendanceFinalized: boolean;
  allowedTrainerIds?: string[];
  isLiveNow?: boolean;
  isUpcoming?: boolean;
}

export interface LiveRecording {
  id: string;
  liveClassId: string;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  notes?: string;
  createdAt: string;
}

export interface AttendanceParticipant {
  userId: string;
  userName: string;
  role: string;
  totalSeconds: number;
  totalMinutes: number;
  attendancePercentage: number;
  attendanceStatus: 'PRESENT' | 'PARTIAL' | 'LATE' | 'ABSENT';
  joinedAt?: string;
  lastHeartbeat?: string;
}

export interface AttendanceReport {
  liveClassId: string;
  title: string;
  threshold: number;
  status: string;
  participants: AttendanceParticipant[];
}

export interface JoinClassResult {
  status: string;
  provider: 'WINNERS_CREEK' | 'GOOGLE_MEET' | 'ZOOM' | 'TEAMS' | 'EXTERNAL';
  meetingUrl?: string;
  passcode?: string;
  roomId?: string;
  title?: string;
  timestamp?: string;
}

import { api } from '@/lib/api';

export const liveClassApi = {
  /**
   * Fetch all live classes strictly eligible for current authenticated user.
   */
  async getMyLiveClasses(): Promise<LiveClass[]> {
    const res = await api.get<{ success: boolean; data: LiveClass[] }>('/live-classes/my');
    return res.data;
  },

  /**
   * Fetch single live class details with strict authorization.
   */
  async getLiveClass(classId: string): Promise<LiveClass> {
    const res = await api.get<{ success: boolean; data: LiveClass }>(`/live-classes/${classId}`);
    return res.data;
  },

  /**
   * Register join event and obtain session credentials.
   */
  async joinClass(classId: string): Promise<JoinClassResult> {
    const res = await api.post<{ success: boolean; data: JoinClassResult }>(`/live-classes/${classId}/join`);
    return res.data;
  },

  /**
   * Register leave event.
   */
  async leaveClass(classId: string): Promise<void> {
    await api.post(`/live-classes/${classId}/leave`);
  },

  /**
   * Send heartbeat to accumulate active attendance duration.
   */
  async sendHeartbeat(
    classId: string,
    state: { audioActive?: boolean; videoActive?: boolean; screenShareActive?: boolean } = {}
  ): Promise<{ status: string; totalSeconds: number }> {
    const res = await api.post<{ success: boolean; data: { status: string; totalSeconds: number } }>(
      `/live-classes/${classId}/heartbeat`,
      state
    );
    return res.data;
  },

  /**
   * Host starts live class.
   */
  async startClass(classId: string): Promise<{ status: string; actualStartsAt: string }> {
    const res = await api.post<{ success: boolean; data: { status: string; actualStartsAt: string } }>(
      `/live-classes/${classId}/start`
    );
    return res.data;
  },

  /**
   * Host concludes live class and finalizes attendance records.
   */
  async endClass(classId: string): Promise<any> {
    const res = await api.post<{ success: boolean; data: any }>(`/live-classes/${classId}/end`);
    return res.data;
  },

  /**
   * Create / schedule a new class.
   */
  async createClass(payload: Partial<LiveClass>): Promise<LiveClass> {
    const res = await api.post<{ success: boolean; data: LiveClass }>('/live-classes', payload);
    return res.data;
  },

  /**
   * Get attendance summary report for a class.
   */
  async getAttendance(classId: string): Promise<AttendanceReport> {
    const res = await api.get<{ success: boolean; data: AttendanceReport }>(
      `/live-classes/${classId}/attendance`
    );
    return res.data;
  },

  /**
   * Get eligible recordings.
   */
  async getMyRecordings(): Promise<LiveRecording[]> {
    const res = await api.get<{ success: boolean; data: LiveRecording[] }>(
      '/live-classes/recordings/my'
    );
    return res.data;
  },
};
