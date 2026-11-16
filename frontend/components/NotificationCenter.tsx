"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import { useAuth } from "@/context/AuthContext";

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationResponse {
  success: boolean;
  data: { notifications: NotificationItem[]; unreadCount: number };
}

function toApplicationServerKey(value: string): ArrayBuffer {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const decoded = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function NotificationCenter() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  const loadNotifications = useCallback(async () => {
    try {
      const response = await API.get<NotificationResponse>("/users/notifications");
      setNotifications(response.data.data.notifications || []);
      setUnreadCount(response.data.data.unreadCount || 0);
    } catch {
      // Keep the notification menu usable even if a refresh briefly fails.
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 30000);
    const onNewNotification = (event: Event) => {
      const notification = (event as CustomEvent<NotificationItem>).detail;
      if (!notification) return;
      setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 50));
      if (!notification.readAt) setUnreadCount((count) => count + 1);
    };
    window.addEventListener("taskmanager:notification", onNewNotification);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("taskmanager:notification", onNewNotification);
    };
  }, [loadNotifications, user?.id]);

  useEffect(() => {
    const supported = typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setPushSupported(supported);
    if (!supported || !user) return;
    void navigator.serviceWorker.getRegistration("/sw.js")
      .then((registration) => registration?.pushManager.getSubscription())
      .then(async (subscription) => {
        setPushEnabled(Boolean(subscription));
        if (subscription) {
          await API.post("/users/notifications/push-subscriptions", subscription.toJSON());
        }
      })
      .catch(() => setPushEnabled(false));
  }, [user?.id]);

  const enablePush = async () => {
    setPushError("");
    setPushBusy(true);
    try {
      if (!pushSupported) throw new Error("This browser does not support background notifications.");
      const permission = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== "granted") throw new Error("Allow notifications in your browser to receive alerts when the app is closed.");

      const keyResponse = await API.get<{ data: { publicKey: string } }>("/users/notifications/push-public-key");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription() ||
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toApplicationServerKey(keyResponse.data.data.publicKey),
        });
      await API.post("/users/notifications/push-subscriptions", subscription.toJSON());
      setPushEnabled(true);
      toast.success("Browser notifications are enabled.");
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } }; message?: string })
        .response?.data?.message || (error as { message?: string }).message || "Could not enable browser notifications.";
      setPushError(message);
    } finally {
      setPushBusy(false);
    }
  };

  const openNotification = async (notification: NotificationItem) => {
    if (!notification.readAt) {
      try {
        await API.patch(`/users/notifications/${notification.id}/read`);
        setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        // Still open the linked work item when marking the notification fails.
      }
    }
    setOpen(false);
    if (notification.link?.startsWith("/")) window.location.assign(notification.link);
  };

  if (!user) return null;

  return (
    <div className="notification-center">
      <button
        type="button"
        className="dashboard-notification-button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">🔔</span>
        <span className="dashboard-notification-label">Notifications</span>
        {unreadCount > 0 && <span className="dashboard-notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && (
        <section className="notification-panel" aria-label="Notifications">
          <header className="notification-panel-header">
            <div>
              <strong>Notifications</strong>
              <span>{unreadCount ? `${unreadCount} unread` : "You're all caught up"}</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications">×</button>
          </header>

          <div className="notification-panel-list">
            {notifications.length ? notifications.map((notification) => (
              <button
                type="button"
                key={notification.id}
                className={`notification-panel-item${notification.readAt ? "" : " is-unread"}`}
                onClick={() => void openNotification(notification)}
              >
                <span className="notification-panel-item-title">{notification.title}</span>
                <span className="notification-panel-item-message">{notification.message}</span>
                <time dateTime={notification.createdAt}>{dateLabel(notification.createdAt)}</time>
              </button>
            )) : <p className="notification-panel-empty">New task and ticket updates will appear here.</p>}
          </div>

          <footer className="notification-panel-footer">
            {pushEnabled ? (
              <span className="notification-push-enabled">✓ Browser notifications are on</span>
            ) : (
              <button type="button" onClick={() => void enablePush()} disabled={pushBusy || !pushSupported}>
                {pushBusy ? "Enabling…" : "Enable notifications when app is closed"}
              </button>
            )}
            {pushError && <p role="alert">{pushError}</p>}
            {!pushSupported && <p>This browser does not support background notifications.</p>}
          </footer>
        </section>
      )}
    </div>
  );
}
