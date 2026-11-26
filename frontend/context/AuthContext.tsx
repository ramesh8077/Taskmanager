"use client";

/**
 * Auth Context
 *
 * Provides global authentication state and actions:
 *   - user / isAuthenticated / loading
 *   - login / register / logout
 *
 * On mount, calls GET /api/auth/me to restore the session from the
 * HTTP-Only cookie set by the backend.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import { playMeetingNotificationSound } from "@/lib/meetingNotificationSound";

interface NotificationMessage {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string;
  createdAt: string;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface User {
  id: number;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "EMPLOYEE";
  department: string;
  position: "MANAGER" | "SUB_MANAGER" | "TEAM_LEAD" | "EMPLOYEE" | "INTERN";
  reportsToId: number | null;
  employeeId: string;
  permissions: string[];
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (data: { email: string; password: string }) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    department: string;
    position: User["position"];
    reportsToId: number | null;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Create Context ──────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

// ─── Provider Component ──────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = !!user;

  useEffect(() => {
    let mounted = true;
    const restoreSession = async () => {
      try {
        const { data } = await API.get("/auth/me");
        if (mounted) setUser(data.success ? data.data.user : null);
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (loading || !user) return;

    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let reconnectDelay = 1000;
    let lastNotificationId = 0;
    let lastChatId = 0;
    const seenNotificationIds = new Set<number>();

    const setRealtimeStatus = (connected: boolean) => {
      (window as Window & { __taskmanagerRealtimeOpen?: boolean }).__taskmanagerRealtimeOpen = connected;
      window.dispatchEvent(new CustomEvent("taskmanager:realtime-status", { detail: { connected } }));
    };

    const showNotification = (notification: NotificationMessage) => {
      toast.custom((toastItem) => (
        <button
          type="button"
          onClick={() => {
            toast.dismiss(toastItem.id);
            if (notification.link?.startsWith("/")) window.location.assign(notification.link);
          }}
          style={{
            width: "min(380px, calc(100vw - 32px))",
            padding: "14px 16px",
            border: notification.type === "chat_mention" ? "2px solid #f97316" : "1px solid var(--border-subtle)",
            borderRadius: 12,
            background: "var(--surface-card)",
            color: "var(--text-primary)",
            boxShadow: "0 12px 32px rgb(0 0 0 / 18%)",
            textAlign: "left",
            cursor: "pointer",
          }}
          aria-label={`${notification.title}: ${notification.message}. Click to open.`}
        >
            <strong style={{ display: "block", marginBottom: 4, color: notification.type === "chat_mention" ? "#f97316" : undefined }}>{notification.type === "chat_mention" ? "🔔 You were mentioned" : notification.title}</strong>
          <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{notification.message}</span>
          <span style={{ display: "block", marginTop: 8, color: "var(--accent)", fontSize: 12 }}>Click to view</span>
        </button>
      ), { duration: 8000, position: "top-right" });
    };

    const handleNotification = (notification?: NotificationMessage) => {
      const notificationId = Number(notification?.id);
      if (!notification || !Number.isSafeInteger(notificationId) || notificationId < 1 || notificationId <= lastNotificationId || seenNotificationIds.has(notificationId)) return;
      seenNotificationIds.add(notificationId);
      lastNotificationId = Math.max(lastNotificationId, notificationId);
      if (notification.type.startsWith("MEETING_")) playMeetingNotificationSound();
      showNotification(notification);
      window.dispatchEvent(new CustomEvent("taskmanager:notification", { detail: notification }));
    };

    const onServiceWorkerMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; notification?: NotificationMessage };
      if (payload?.type === "push-notification") handleNotification(payload.notification);
    };
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

    const connect = () => {
      if (stopped) return;
      try {
        const apiUrl = new URL(API.defaults.baseURL || "/api", window.location.href);
        const socketUrl = new URL(`${apiUrl.pathname.replace(/\/+$/, "")}/realtime/notifications`, apiUrl.origin);
        socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
        socketUrl.searchParams.set("after", String(lastNotificationId));
        if (lastChatId > 0) socketUrl.searchParams.set("afterChat", String(lastChatId));
        socket = new WebSocket(socketUrl);
        socket.onopen = () => {
          reconnectDelay = 1000;
          setRealtimeStatus(true);
        };
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(String(event.data)) as { type?: string; notification?: NotificationMessage; message?: { id?: number } };
            if (payload.type === "notification") handleNotification(payload.notification);
            if (payload.type === "chat_message" && payload.message) {
              const messageId = Number(payload.message.id);
              if (Number.isSafeInteger(messageId) && messageId > 0) {
                lastChatId = Math.max(lastChatId, messageId);
              }
              window.dispatchEvent(new CustomEvent("taskmanager:chat-message", { detail: payload.message }));
            }
          } catch {
            // Ignore malformed messages and keep the connection alive.
          }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = () => {
          setRealtimeStatus(false);
          if (stopped) return;
          reconnectTimer = window.setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        };
      } catch {
        setRealtimeStatus(false);
        if (!stopped) {
          reconnectTimer = window.setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        }
      }
    };

    const start = async () => {
      try {
        const response = await API.get<{ data?: { notifications?: NotificationMessage[] } }>("/users/notifications");
        const notifications = response.data.data?.notifications || [];
        lastNotificationId = notifications.reduce((latest, item) => Math.max(latest, Number(item.id) || 0), 0);
      } catch {
        // The authenticated socket can still reconnect if the initial list request fails.
      }
      if (!stopped) connect();
    };
    void start();

    return () => {
      stopped = true;
      setRealtimeStatus(false);
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
      socket?.close();
    };
  }, [loading, router, user?.id]);

  // Login
  const login = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    try {
      setLoading(true);
      const { data } = await API.post("/auth/login", { email, password });
      if (data.success) {
        setUser(data.data.user);
        toast.success(data.message || "Login successful!");
        router.push("/dashboard");
      }
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Login failed. Please try again.";
      toast.error(message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Register
  const register = async ({
    name,
    email,
    password,
    department,
    position,
    reportsToId,
  }: {
    name: string;
    email: string;
    password: string;
    department: string;
    position: User["position"];
    reportsToId: number | null;
  }) => {
    try {
      setLoading(true);
      const { data } = await API.post("/auth/register", {
        name,
        email,
        password,
        department,
        position,
        reportsToId,
      });
      if (data.success) {
        toast.success(data.message || "Registration successful! Please log in.");
        router.push("/login");
      }
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Registration failed. Please try again.";
      toast.error(message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const logout = async () => {
    try {
      setLoading(true);
      const { data } = await API.post("/auth/logout");
      setUser(null);
      toast.success(data?.message || "Logged out successfully.");
      router.push("/login");
    } catch {
      setUser(null);
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Custom Hook ─────────────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an <AuthProvider>.");
  }
  return context;
}

export default AuthContext;
