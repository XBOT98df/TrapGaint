import { supabase } from './supabase';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export interface VoiceCall {
  callId: string;
  callerId: string;
  callerName: string;
  receiverId: string;
  receiverName: string;
  state: CallState;
  startTime?: number;
}

class VoiceChatService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentCall: VoiceCall | null = null;
  private channel: any = null;
  
  // Callbacks
  public onIncomingCall: ((call: VoiceCall) => void) | null = null;
  public onCallStateChange: ((state: CallState) => void) | null = null;
  public onRemoteStream: ((stream: MediaStream) => void) | null = null;
  public onCallEnded: (() => void) | null = null;

  // ICE servers for NAT traversal (using free STUN servers)
  private iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ]
  };

  async initialize(userId: string) {
    try {
      // Subscribe to call signals for this user
      this.channel = supabase.channel(`voice_call_${userId}`)
        .on('broadcast', { event: 'call_signal' }, async (payload: any) => {
          await this.handleSignal(payload.payload);
        })
        .subscribe();

      console.log('[Voice Chat] Initialized for user:', userId);
    } catch (error) {
      console.error('[Voice Chat] Failed to initialize:', error);
      throw error;
    }
  }

  async startCall(callerId: string, callerName: string, receiverId: string, receiverName: string): Promise<string> {
    const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentCall = {
      callId,
      callerId,
      callerName,
      receiverId,
      receiverName,
      state: 'calling',
      startTime: Date.now()
    };

    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('[Voice Chat] MediaDevices API not available in this environment');
      throw new Error('Voice chat is not supported in this environment. Please use the web version for voice calls.');
    }

    // Get microphone access
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      console.log('[Voice Chat] Got local stream');
    } catch (err) {
      console.error('[Voice Chat] Failed to get microphone:', err);
      throw new Error('Microphone access denied');
    }

    // Create peer connection
    this.peerConnection = new RTCPeerConnection(this.iceServers);

    // Add local stream to peer connection
    this.localStream.getTracks().forEach(track => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('[Voice Chat] Received remote track');
      this.remoteStream = event.streams[0];
      if (this.onRemoteStream) {
        this.onRemoteStream(this.remoteStream);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(receiverId, {
          type: 'ice_candidate',
          candidate: event.candidate,
          callId
        });
      }
    };

    // Create offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // Send call offer to receiver
    await this.sendSignal(receiverId, {
      type: 'call_offer',
      callId,
      callerId,
      callerName,
      offer: offer
    });

    if (this.onCallStateChange) {
      this.onCallStateChange('calling');
    }

    return callId;
  }

  async answerCall(callId: string) {
    if (!this.currentCall || this.currentCall.callId !== callId) {
      console.error('[Voice Chat] No matching call to answer');
      return;
    }

    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('[Voice Chat] MediaDevices API not available in this environment');
      throw new Error('Voice chat is not supported in this environment');
    }

    // Get microphone access
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      console.log('[Voice Chat] Got local stream for answer');
    } catch (err) {
      console.error('[Voice Chat] Failed to get microphone:', err);
      throw new Error('Microphone access denied');
    }

    // Add local stream to peer connection
    this.localStream.getTracks().forEach(track => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });

    // Create answer
    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    // Send answer to caller
    await this.sendSignal(this.currentCall.callerId, {
      type: 'call_answer',
      callId,
      answer: answer
    });

    this.currentCall.state = 'connected';
    if (this.onCallStateChange) {
      this.onCallStateChange('connected');
    }
  }

  async rejectCall(callId: string) {
    if (!this.currentCall || this.currentCall.callId !== callId) return;

    await this.sendSignal(this.currentCall.callerId, {
      type: 'call_rejected',
      callId
    });

    this.endCall();
  }

  async endCall() {
    if (this.currentCall) {
      // Notify other party
      const otherUserId = this.currentCall.callerId === this.currentCall.callerId 
        ? this.currentCall.receiverId 
        : this.currentCall.callerId;
      
      await this.sendSignal(otherUserId, {
        type: 'call_ended',
        callId: this.currentCall.callId
      });
    }

    // Clean up
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.currentCall = null;

    if (this.onCallStateChange) {
      this.onCallStateChange('ended');
    }

    if (this.onCallEnded) {
      this.onCallEnded();
    }

    console.log('[Voice Chat] Call ended and cleaned up');
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // Return true if muted
    }
    return false;
  }

  isMuted(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    return audioTrack ? !audioTrack.enabled : false;
  }

  getCurrentCall(): VoiceCall | null {
    return this.currentCall;
  }

  private async handleSignal(signal: any) {
    console.log('[Voice Chat] Received signal:', signal.type);

    switch (signal.type) {
      case 'call_offer':
        await this.handleCallOffer(signal);
        break;
      case 'call_answer':
        await this.handleCallAnswer(signal);
        break;
      case 'ice_candidate':
        await this.handleIceCandidate(signal);
        break;
      case 'call_rejected':
        this.handleCallRejected();
        break;
      case 'call_ended':
        this.endCall();
        break;
    }
  }

  private async handleCallOffer(signal: any) {
    this.currentCall = {
      callId: signal.callId,
      callerId: signal.callerId,
      callerName: signal.callerName,
      receiverId: '', // Will be set by the receiver
      receiverName: '',
      state: 'ringing'
    };

    // Create peer connection
    this.peerConnection = new RTCPeerConnection(this.iceServers);

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('[Voice Chat] Received remote track');
      this.remoteStream = event.streams[0];
      if (this.onRemoteStream) {
        this.onRemoteStream(this.remoteStream);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(signal.callerId, {
          type: 'ice_candidate',
          candidate: event.candidate,
          callId: signal.callId
        });
      }
    };

    // Set remote description
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));

    // Notify app of incoming call
    if (this.onIncomingCall) {
      this.onIncomingCall(this.currentCall);
    }

    if (this.onCallStateChange) {
      this.onCallStateChange('ringing');
    }
  }

  private async handleCallAnswer(signal: any) {
    if (!this.peerConnection) return;

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
    
    if (this.currentCall) {
      this.currentCall.state = 'connected';
    }

    if (this.onCallStateChange) {
      this.onCallStateChange('connected');
    }
  }

  private async handleIceCandidate(signal: any) {
    if (!this.peerConnection) return;

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
    } catch (err) {
      console.error('[Voice Chat] Error adding ICE candidate:', err);
    }
  }

  private handleCallRejected() {
    console.log('[Voice Chat] Call was rejected');
    this.endCall();
  }

  private async sendSignal(userId: string, signal: any) {
    const channel = supabase.channel(`voice_call_${userId}`);
    await channel.send({
      type: 'broadcast',
      event: 'call_signal',
      payload: signal
    });
  }

  cleanup() {
    this.endCall();
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
  }
}

export const voiceChatService = new VoiceChatService();
