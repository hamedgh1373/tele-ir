"use client";

import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  FormEvent,
  MouseEvent,
  TouchEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { signOut } from "next-auth/react";
import { BrandMark } from "@/components/brand-mark";

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  avatarUrl?: string;
};

export type ChatItem = {
  id: string;
  type: "direct" | "group" | "channel" | "saved";
  title: string;
  subtitle?: string;
  lastMessageText?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  isMuted?: boolean;
  isArchived?: boolean;
  pinnedMessageIds?: string[];
  participantIds: string[];
  adminIds: string[];
  avatarUrl?: string;
};

export type MessageItem = {
  id: string;
  chatId?: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  text: string;
  createdAt: string;
  editedAt?: string;
  deliveredTo?: string[];
  readBy?: string[];
  attachment?: {
    fileId: string;
    name: string;
    mimeType: string;
    size: number;
    isImage: boolean;
    url: string;
  };
  forwardedFrom?: {
    chatId: string;
    messageId: string;
    senderName: string;
    senderEmail: string;
  } | null;
  replyTo?: {
    messageId: string;
    senderName?: string;
    text?: string;
  } | null;
  reactions?: Record<string, string[]>;
};

export type DirectoryUser = {
  id: string;
  name: string;
  email: string;
};

export type ContactMatch = {
  userId: string;
  name: string;
  email: string;
  phone: string;
};

type GlobalSearchResults = {
  chats: Array<{ id: string; type: ChatItem["type"]; title: string; subtitle?: string }>;
  contacts: Array<{ id: string; name: string; email: string; phone?: string }>;
  messages: Array<{ chatId: string; chatTitle: string; messageId: string; senderName: string; text: string; createdAt: string }>;
};

function makeClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mergeMessagesById(nextMessages: MessageItem[]) {
  const map = new Map<string, MessageItem>();
  for (const message of nextMessages) {
    map.set(message.id, message);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

async function logClientIssue(message: string, data?: Record<string, unknown>) {
  try {
    await fetch("/api/debug/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, data }),
    });
  } catch {
    // Client logging must never block the UI.
  }
}

function formatChatTime(
  value?: string,
  mode: "time" | "dateTime" = "dateTime",
) {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat("fa-IR", {
    ...(mode === "time"
      ? { hour: "2-digit", minute: "2-digit" }
      : { dateStyle: "short", timeStyle: "short" }),
    timeZone: "Asia/Tehran",
  }).format(new Date(value));
}


function normalizeIdentity(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isOwnMessage(message: MessageItem, currentUser: CurrentUser) {
  const senderId = normalizeIdentity(message.senderId);
  const currentId = normalizeIdentity(currentUser.id);
  const senderEmail = normalizeIdentity(message.senderEmail);
  const currentEmail = normalizeIdentity(currentUser.email);
  const senderName = normalizeIdentity(message.senderName);
  const currentName = normalizeIdentity(currentUser.name);

  return (
    (!!senderId && !!currentId && senderId === currentId) ||
    (!!senderEmail && !!currentEmail && senderEmail === currentEmail) ||
    (!!senderName && !!currentName && senderName === currentName)
  );
}

export function ChatShell({
  currentUser,
  initialChats = [],
  initialMessages = [],
  initialActiveChatId = "",
  initialDirectory = [],
  initialContacts = [],
  initialContactsOpen = false,
}: {
  currentUser: CurrentUser;
  initialChats?: ChatItem[];
  initialMessages?: MessageItem[];
  initialActiveChatId?: string;
  initialDirectory?: DirectoryUser[];
  initialContacts?: ContactMatch[];
  initialContactsOpen?: boolean;
}) {
  const [chats, setChats] = useState<ChatItem[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState<string>(initialActiveChatId);
  const activeChatIdRef = useRef<string>(initialActiveChatId);
  const [activeChatSnapshot, setActiveChatSnapshot] = useState<ChatItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages);
  const [composer, setComposer] = useState("");
  const [directory, setDirectory] = useState<DirectoryUser[]>(initialDirectory);
  const [query, setQuery] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResults>({ chats: [], contacts: [], messages: [] });
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [memberEmails, setMemberEmails] = useState("");
  const [chatType, setChatType] = useState<"direct" | "group" | "channel">(
    "direct",
  );
  const [status, setStatus] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "chat">(
    initialActiveChatId ? "chat" : "list",
  );
  const [contactsOpen, setContactsOpen] = useState(initialContactsOpen);
  const [contacts, setContacts] = useState<ContactMatch[]>(initialContacts);
  const [importingContacts, setImportingContacts] = useState(false);
  const [manualContactPhone, setManualContactPhone] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingText, setEditingText] = useState("");
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [activeSearchResult, setActiveSearchResult] = useState(0);
  const [forwardingMessage, setForwardingMessage] =
    useState<MessageItem | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [replyToMessage, setReplyToMessage] = useState<MessageItem | null>(
    null,
  );
  const [hideForwardSender, setHideForwardSender] = useState(false);
  const [chatProfileOpen, setChatProfileOpen] = useState(false);
  const [chatProfile, setChatProfile] = useState<any>(null);
  const [chatActionsOpen, setChatActionsOpen] = useState(false);
  const [activeFolder, setActiveFolder] = useState<
    "all" | "direct" | "group" | "channel" | "archived"
  >("all");
  const [selectedMemberUserIds, setSelectedMemberUserIds] = useState<string[]>(
    [],
  );
  const [forwardTargetIds, setForwardTargetIds] = useState<string[]>([]);
  const [chatContextMenu, setChatContextMenu] = useState<{
    chat: ChatItem;
    x: number;
    y: number;
  } | null>(null);
  const [toast, setToast] = useState<{
    id: string;
    title: string;
    body: string;
    chatId?: string;
  } | null>(null);
  const prevUnreadRef = useRef<Record<string, number>>({});
  const [mediaPreview, setMediaPreview] = useState<MessageItem | null>(null);
  const [presence, setPresence] = useState<
    Record<
      string,
      { isOnline: boolean; lastSeenAt: string; typingInChatId?: string }
    >
  >({});
  const [passcodeLocked, setPasscodeLocked] = useState(false);
  const [messageMenu, setMessageMenu] = useState<{
    message: MessageItem;
    x: number;
    y: number;
  } | null>(null);
  const [refreshingPane, setRefreshingPane] = useState<"" | "list" | "chat">(
    "",
  );
  const [pullPane, setPullPane] = useState<"" | "list" | "chat">("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const pullTargetRef = useRef<"" | "list" | "chat">("");
  const sendingMessageRef = useRef(false);

  const activeChat = useMemo(() => {
    const current = chats.find((chat) => chat.id === activeChatId) || null;
    if (current) return current;
    return activeChatSnapshot?.id === activeChatId ? activeChatSnapshot : null;
  }, [activeChatId, activeChatSnapshot, chats]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  const savedChatId = useMemo(
    () => chats.find((chat) => chat.type === "saved")?.id || "",
    [chats],
  );
  const directPeerId = useMemo(() => {
    if (!activeChat || activeChat.type !== "direct") {
      return "";
    }
    return activeChat.participantIds.find((id) => id !== currentUser.id) || "";
  }, [activeChat, currentUser.id]);
  const canPostInActiveChat = useMemo(() => {
    if (!activeChat) {
      return false;
    }
    if (activeChat.type === "channel") {
      return activeChat.adminIds.includes(currentUser.id);
    }
    return true;
  }, [activeChat, currentUser.id]);
  const visibleChats = useMemo(() => {
    return chats
      .filter((chat) => {
        if (activeFolder === "archived") return chat.isArchived;
        if (chat.isArchived) return false;
        if (activeFolder === "all") return true;
        return chat.type === activeFolder;
      })
      .sort((a, b) => {
        if (a.type === "saved" && b.type !== "saved") return -1;
        if (a.type !== "saved" && b.type === "saved") return 1;
        const aPinned = a.pinnedMessageIds?.includes("__chat__") ? 1 : 0;
        const bPinned = b.pinnedMessageIds?.includes("__chat__") ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        return new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
      });
  }, [activeFolder, chats]);

  const peerPresence = useMemo(
    () => (directPeerId ? presence[directPeerId] : undefined),
    [directPeerId, presence],
  );

  const typingUsersText = useMemo(() => {
    if (!activeChatId) return "";
    const typing = Object.entries(presence).filter(
      ([, value]) => value.typingInChatId === activeChatId && value.isOnline,
    );
    return typing.length ? "typing..." : "";
  }, [activeChatId, presence]);

  const searchMatches = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => {
        const text = message.text?.toLowerCase() || "";
        const fileName = message.attachment?.name?.toLowerCase() || "";
        return text.includes(q) || fileName.includes(q);
      });
  }, [chatSearchQuery, messages]);

  const activePinnedMessage = useMemo(() => {
    const pinnedIds = (activeChat?.pinnedMessageIds || []).filter((id) => id !== "__chat__");
    if (!pinnedIds.length) return null;
    const pinnedId = pinnedIds[pinnedIds.length - 1];
    return messages.find((message) => message.id === pinnedId) || null;
  }, [activeChat?.pinnedMessageIds, messages]);

  async function loadChats(preferredChatId?: string) {
    const response = await fetch("/api/chats?includeArchived=1", {
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setStatus(data.error || "خطا در دریافت گفتگوها");
      return;
    }

    setChats(data.chats);

    const preferredChat = preferredChatId
      ? (data.chats as ChatItem[]).find((chat) => chat.id === preferredChatId)
      : null;
    const currentActiveChat = activeChatIdRef.current
      ? (data.chats as ChatItem[]).find((chat) => chat.id === activeChatIdRef.current)
      : null;

    if (currentActiveChat) {
      setActiveChatSnapshot(currentActiveChat);
    }

    if (preferredChat) {
      activeChatIdRef.current = preferredChat.id;
      setActiveChatSnapshot(preferredChat);
      setActiveChatId(preferredChat.id);
      setMobilePane("chat");
      if (typeof window !== "undefined") {
        window.history.replaceState(
          null,
          "",
          `/app?chat=${encodeURIComponent(preferredChat.id)}`,
        );
      }
    }
  }

  function selectChat(chatId: string) {
    const selected = chats.find((chat) => chat.id === chatId) || null;
    activeChatIdRef.current = chatId;
    if (selected) {
      setActiveChatSnapshot(selected);
    }
    setActiveChatId(chatId);
    setMobilePane("chat");
    setMenuOpen(false);
  }

  function handleChatLink(
    event: MouseEvent<HTMLAnchorElement>,
    chatId: string,
  ) {
    event.preventDefault();
    window.history.replaceState(
      null,
      "",
      `/app?chat=${encodeURIComponent(chatId)}`,
    );
    selectChat(chatId);
  }

  function openChatContextMenu(event: MouseEvent<HTMLElement>, chat: ChatItem) {
    event.preventDefault();
    const viewportPadding = 10;
    const menuWidth = 220;
    const menuHeight = 144;
    const x = Math.min(
      Math.max(event.clientX, viewportPadding),
      window.innerWidth - menuWidth - viewportPadding,
    );
    const y = Math.min(
      Math.max(event.clientY, viewportPadding),
      window.innerHeight - menuHeight - viewportPadding,
    );
    setChatContextMenu({ chat, x, y });
  }

  async function applyChatListAction(
    chatId: string,
    action:
      | "archive"
      | "unarchive"
      | "pinChat"
      | "unpinChat"
      | "mute"
      | "unmute",
  ) {
    const response = await fetch(`/api/chats/${chatId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "عملیات گفتگو انجام نشد.");
      return;
    }
    setChatContextMenu(null);
    await loadChats(activeChatId);
  }

  function toggleSelectedMember(userId: string) {
    setSelectedMemberUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  function toggleForwardTarget(targetId: string) {
    setForwardTargetIds((current) =>
      current.includes(targetId)
        ? current.filter((id) => id !== targetId)
        : [...current, targetId],
    );
  }

  async function loadMessages(chatId: string) {
    if (!chatId) {
      setMessages([]);
      return;
    }

    const response = await fetch(`/api/chats/${chatId}/messages?limit=80`, {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error || "خطا در دریافت پیام‌ها");
      return;
    }

    setMessages(data.messages);
  }

  async function loadDirectory(searchValue = "") {
    const response = await fetch(
      `/api/directory?q=${encodeURIComponent(searchValue)}`,
      {
        cache: "no-store",
      },
    );
    const data = await response.json();

    if (response.ok) {
      setDirectory(data.users);
    }
  }

  async function loadContacts() {
    const response = await fetch("/api/contacts", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "خطا در دریافت مخاطبین");
      return;
    }
    setContacts((data.contacts || []) as ContactMatch[]);
  }

  async function importContactsFromPhone() {
    const nav = navigator as Navigator & {
      contacts?: {
        select: (
          properties: string[],
          options?: { multiple?: boolean },
        ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
      };
    };

    if (!nav.contacts?.select) {
      return;
    }

    setImportingContacts(true);
    try {
      const picked = await nav.contacts.select(["name", "tel"], {
        multiple: true,
      });
      const contactsPayload = picked
        .flatMap((item) => {
          const name = item.name?.[0] || "";
          const tels = item.tel || [];
          return tels.map((phone) => ({ name, phone }));
        })
        .filter((item) => item.phone);

      if (contactsPayload.length === 0) {
        return;
      }

      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: contactsPayload }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.error || "خطا در ذخیره مخاطبین");
        return;
      }
      await loadContacts();
    } catch {
      // Permission denied or user canceled picker.
    } finally {
      setImportingContacts(false);
    }
  }

  async function openContactsPanel() {
    setQuery("");
    setMenuOpen(false);
    setContactsOpen(true);
    await loadContacts();
    await importContactsFromPhone();
  }

  async function addManualContact() {
    const phone = manualContactPhone.trim();
    if (!phone) {
      return;
    }
    const response = await fetch("/api/contacts/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "این کاربر وجود ندارد.");
      return;
    }
    setManualContactPhone("");
    setStatus("");
    await loadContacts();
  }

  function beginPullRefresh(
    event: TouchEvent<HTMLElement>,
    target: "list" | "chat",
  ) {
    const element = event.currentTarget;
    if (element.scrollTop > 0 || refreshingPane) {
      pullStartYRef.current = null;
      pullTargetRef.current = "";
      return;
    }

    pullStartYRef.current = event.touches[0]?.clientY ?? null;
    pullDistanceRef.current = 0;
    pullTargetRef.current = target;
  }

  function trackPullRefresh(event: TouchEvent<HTMLElement>) {
    if (pullStartYRef.current === null || !pullTargetRef.current) {
      return;
    }

    const distance = (event.touches[0]?.clientY ?? 0) - pullStartYRef.current;
    pullDistanceRef.current = Math.max(0, distance);

    if (distance > 24) {
      setPullPane(pullTargetRef.current);
    }
  }

  async function finishPullRefresh() {
    const target = pullTargetRef.current;
    const shouldRefresh = pullDistanceRef.current > 74 && target;

    pullStartYRef.current = null;
    pullDistanceRef.current = 0;
    pullTargetRef.current = "";
    setPullPane("");

    if (!shouldRefresh || refreshingPane) {
      return;
    }

    setRefreshingPane(target);
    try {
      if (target === "list") {
        await loadChats(activeChatId);
        await loadDirectory(query);
        if (contactsOpen) {
          await loadContacts();
        }
      } else {
        await loadChats(activeChatId);
        await loadMessages(activeChatId);
      }
      setStatus("به‌روزرسانی شد.");
    } finally {
      setRefreshingPane("");
    }
  }


  useEffect(() => {
    const searchText = query.trim();
    if (!searchText) {
      setGlobalSearchResults({ chats: [], contacts: [], messages: [] });
      setGlobalSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setGlobalSearchLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchText)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          setGlobalSearchResults({
            chats: data.chats || [],
            contacts: data.contacts || [],
            messages: data.messages || [],
          });
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          void logClientIssue("global search failed", { error: String(error) });
        }
      } finally {
        setGlobalSearchLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    (window as Window & { __teleirHydrated?: boolean }).__teleirHydrated = true;
    void loadChats();
    void loadDirectory();
    void fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAgent: navigator.userAgent || "" }),
    });
  }, []);

  useEffect(() => {
    void loadMessages(activeChatId);
    setChatSearchOpen(false);
    setChatSearchQuery("");
    setSelectedMessageIds([]);
    setReplyToMessage(null);
    setActiveSearchResult(0);
  }, [activeChatId]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (chatSearchOpen) {
        setChatSearchOpen(false);
        setChatSearchQuery("");
        return;
      }
      if (messageMenu || chatContextMenu || forwardingMessage || chatProfileOpen || mediaPreview) {
        setMessageMenu(null);
        setChatContextMenu(null);
        setForwardingMessage(null);
        setChatProfileOpen(false);
        setMediaPreview(null);
        return;
      }
      if (activeChatId) {
        setActiveChatId("");
        setMessages([]);
        setMobilePane("list");
        window.history.replaceState(null, "", "/app");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeChatId, chatContextMenu, chatProfileOpen, chatSearchOpen, forwardingMessage, mediaPreview, messageMenu]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages.length, activeChatId]);

  useEffect(() => {
    if (searchMatches.length === 0) {
      return;
    }
    const current =
      searchMatches[Math.min(activeSearchResult, searchMatches.length - 1)];
    const el = messageRefs.current[current.message.id];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeSearchResult, searchMatches]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPasscodeLocked(localStorage.getItem("teleir-passcode-enabled") === "1");
  }, []);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource("/api/chats/events");
    source.addEventListener("chats", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (Array.isArray(data.chats)) {
          const incomingChats = data.chats as ChatItem[];
          const currentActiveId = activeChatIdRef.current;
          const refreshedActiveChat = currentActiveId
            ? incomingChats.find((chat) => chat.id === currentActiveId) || null
            : null;
          if (refreshedActiveChat) {
            setActiveChatSnapshot(refreshedActiveChat);
          }

          setChats(() => {
            const previousUnread = prevUnreadRef.current;
            const nextUnread: Record<string, number> = {};
            for (const chat of incomingChats) {
              const count = chat.unreadCount || 0;
              nextUnread[chat.id] = count;
              const oldCount = previousUnread[chat.id] || 0;
              if (
                oldCount >= 0 &&
                count > oldCount &&
                chat.id !== currentActiveId &&
                !chat.isMuted
              ) {
                setToast({
                  id: `${chat.id}-${Date.now()}`,
                  title: chat.title || "پیام جدید",
                  body: chat.lastMessageText || "پیام جدید",
                  chatId: chat.id,
                });
              }
            }
            prevUnreadRef.current = nextUnread;
            return incomingChats;
          });
        }
      } catch { }
    });
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!activeChatId || typeof EventSource === "undefined") return;
    const source = new EventSource(
      `/api/chats/${activeChatId}/messages/events`,
    );
    source.addEventListener("messages", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (Array.isArray(data.messages)) {
          setMessages(mergeMessagesById(data.messages));
        }
      } catch { }
    });
    source.addEventListener("closed", (event) => {
      source.close();
      // Do not automatically leave the chat on transient SSE/server refresh.
      // A send/update may briefly close the stream; keeping the selected chat
      // prevents Telegram-like composer from jumping back to the chat list.
      void logClientIssue("message-stream-closed", {
        chatId: activeChatIdRef.current,
        detail: (event as MessageEvent).data || null,
      });
    });
    return () => source.close();
  }, [activeChatId]);

  useEffect(() => {
    const sendPresence = () => {
      void fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typingInChatId: composer.trim() && activeChatId ? activeChatId : "",
        }),
      });
    };
    sendPresence();
    const timer = window.setInterval(sendPresence, 15000);
    return () => window.clearInterval(timer);
  }, [activeChatId, composer]);

  useEffect(() => {
    const loadPresence = async () => {
      const response = await fetch("/api/presence", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setPresence(data.presence || {});
    };
    void loadPresence();
    const timer = window.setInterval(loadPresence, 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (typeof EventSource !== "undefined") return;
    const interval = window.setInterval(() => {
      if (activeChatId) {
        void loadMessages(activeChatId);
      }
      void loadChats(activeChatId);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [activeChatId]);

  useEffect(() => {
    function closeMessageMenu() {
      setMessageMenu(null);
      setChatContextMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMessageMenu(null);
        setChatContextMenu(null);
        setForwardingMessage(null);
      }
    }

    window.addEventListener("scroll", closeMessageMenu, true);
    window.addEventListener("resize", closeMessageMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", closeMessageMenu, true);
      window.removeEventListener("resize", closeMessageMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  async function handleCreateChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    const selectedContacts = contacts.filter((item) =>
      selectedMemberUserIds.includes(item.userId),
    );
    const payload =
      chatType === "direct"
        ? { type: "direct", email: query }
        : {
          type: chatType,
          title: newTitle,
          memberEmails: selectedContacts
            .map((item) => item.email)
            .filter(Boolean),
          memberIds: selectedMemberUserIds,
        };

    const response = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error || "خطا در ساخت گفتگو");
      return;
    }

    setQuery("");
    setNewTitle("");
    setMemberEmails("");
    setSelectedMemberUserIds([]);
    setStatus("گفتگو ساخته شد.");
    await loadChats(data.chat.id);
  }

  async function startDirectChat(email: string) {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      return;
    }

    setStatus("");
    const response = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "direct", email: trimmedEmail }),
    });
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error || "خطا در ساخت گفتگو");
      return;
    }

    setQuery("");
    await loadChats(data.chat.id);
    setMobilePane("chat");
  }

  async function openSavedMessages() {
    setStatus("");
    const response = await fetch("/api/chats/saved", {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "خطا در بازکردن Saved Messages");
      return;
    }
    await loadChats(data.chat.id);
    setMobilePane("chat");
    setMenuOpen(false);
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    await sendCurrentMessage();
  }

  async function sendCurrentMessage() {
    if (sendingMessageRef.current) {
      return;
    }

    const text = composer.trim();
    const chatId = activeChatIdRef.current || activeChatId;

    if (!chatId) {
      return;
    }

    // Keep the current chat locked while submit/network/SSE events are running.
    sendingMessageRef.current = true;
    activeChatIdRef.current = chatId;
    setActiveChatId(chatId);
    setMobilePane("chat");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/app?chat=${encodeURIComponent(chatId)}`);
    }

    try {
      if (editingMessageId) {
        if (text) {
          await saveEditedMessage(editingMessageId, text);
        }
        activeChatIdRef.current = chatId;
        setActiveChatId(chatId);
        setMobilePane("chat");
        return;
      }

      if (!canPostInActiveChat) {
        setStatus("در این کانال فقط مدیر می‌تواند پیام ارسال کند.");
        activeChatIdRef.current = chatId;
        setActiveChatId(chatId);
        setMobilePane("chat");
        return;
      }

      if (selectedFiles.length > 0) {
        await uploadSelectedFiles(text);
        activeChatIdRef.current = chatId;
        setActiveChatId(chatId);
        setMobilePane("chat");
        return;
      }

      if (!text) {
        return;
      }

      const activeChatBeforeSend = activeChatSnapshot || chats.find((chat) => chat.id === chatId) || null;
      if (activeChatBeforeSend) {
        setActiveChatSnapshot(activeChatBeforeSend);
      }

      const optimisticId = `pending-${makeClientId()}`;
      const now = new Date().toISOString();
      const replySnapshot = replyToMessage
        ? {
          messageId: replyToMessage.id,
          senderName: replyToMessage.senderName,
          text: replyToMessage.text || replyToMessage.attachment?.name || "",
        }
        : null;

      const optimisticMessage: MessageItem = {
        id: optimisticId,
        chatId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderEmail: currentUser.email,
        text,
        createdAt: now,
        deliveredTo: [currentUser.id],
        readBy: [currentUser.id],
        replyTo: replySnapshot,
      };

      setStatus("");
      setComposer("");
      setReplyToMessage(null);
      setMessages((currentMessages) => mergeMessagesById([...currentMessages, optimisticMessage]));
      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === chatId
            ? {
              ...chat,
              lastMessageText: text,
              lastMessageAt: now,
              unreadCount: 0,
            }
            : chat,
        ),
      );

      const response = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          replyTo: replySnapshot || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.message?.id) {
        await logClientIssue("message-send-failed", {
          chatId,
          status: response.status,
          responseOk: response.ok,
          error: data?.error || null,
          body: data || null,
        });
        setStatus(data?.error || "خطا در ارسال پیام. لاگ ثبت شد.");
        setMessages((currentMessages) =>
          currentMessages.filter((message) => message.id !== optimisticId),
        );
        setComposer(text);
        activeChatIdRef.current = chatId;
        setActiveChatId(chatId);
        setMobilePane("chat");
        return;
      }

      setMessages((currentMessages) =>
        mergeMessagesById(
          currentMessages.map((message) =>
            message.id === optimisticId ? data.message : message,
          ),
        ),
      );

      activeChatIdRef.current = chatId;
      setActiveChatId(chatId);
      setMobilePane("chat");

      // Refresh the chat list in the background, but never let it close the active chat.
      void loadChats(chatId);
    } catch (error) {
      await logClientIssue("message-send-network-error", {
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
      setStatus("ارتباط با سرور برقرار نشد. لاگ ثبت شد.");
      setComposer(text);
      activeChatIdRef.current = chatId;
      setActiveChatId(chatId);
      setMobilePane("chat");
    } finally {
      sendingMessageRef.current = false;
    }
  }

  async function addMembers() {
    if (!activeChatId || !memberEmails.trim()) {
      return;
    }

    const response = await fetch(`/api/chats/${activeChatId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emails: memberEmails
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error || "خطا در افزودن اعضا");
      return;
    }

    setStatus("اعضا اضافه شدند.");
    setMemberEmails("");
    await loadChats(activeChatId);
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }
    setSelectedFiles((current) => [...current, ...files]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function uploadSelectedFiles(caption: string) {
    if (!activeChatId || selectedFiles.length === 0) {
      return;
    }
    if (!canPostInActiveChat) {
      setStatus("در این کانال فقط مدیر می‌تواند فایل ارسال کند.");
      return;
    }

    setUploading(true);
    setStatus("");
    try {
      for (let i = 0; i < selectedFiles.length; i += 1) {
        const file = selectedFiles[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("caption", i === 0 ? caption : "");
        let response: Response;
        let data: any = {};
        try {
          response = await fetch(`/api/chats/${activeChatId}/upload`, {
            method: "POST",
            body: formData,
          });
          data = await response.json().catch(() => ({}));
        } catch (error) {
          await logClientIssue("file-upload-network-error", {
            chatId: activeChatId,
            fileName: file.name,
            size: file.size,
            error: error instanceof Error ? error.message : String(error),
          });
          setStatus("ارتباط با سرور هنگام آپلود برقرار نشد. لاگ ثبت شد.");
          return;
        }
        if (!response.ok) {
          await logClientIssue("file-upload-failed", {
            chatId: activeChatId,
            status: response.status,
            fileName: file.name,
            size: file.size,
            error: data.error || null,
          });
          setStatus(data.error || "خطا در آپلود فایل");
          return;
        }
        setMessages((currentMessages) =>
          mergeMessagesById([...currentMessages, data.message]),
        );
      }
      setComposer("");
      setSelectedFiles([]);
      await loadChats(activeChatId);
    } finally {
      setUploading(false);
    }
  }

  function removeSelectedFile(index: number) {
    setSelectedFiles((current) => current.filter((_, i) => i !== index));
  }

  function formatFileSize(file: File) {
    if (file.size < 1024 * 1024) {
      return `${Math.ceil(file.size / 1024)} KB`;
    }
    return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function startEditMessage(message: MessageItem) {
    setMessageMenu(null);
    setReplyToMessage(null);
    setSelectedMessageIds([]);
    setEditingMessageId(message.id);
    setEditingText(message.text || "");
    setComposer(message.text || "");
  }

  function cancelEditMessage() {
    setEditingMessageId("");
    setEditingText("");
    setComposer("");
  }

  async function saveEditedMessage(
    messageId: string,
    nextText = composer.trim(),
  ) {
    const text = nextText.trim();
    if (!activeChatId || !text) {
      return;
    }

    const response = await fetch(
      `/api/chats/${activeChatId}/messages/${messageId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "خطا در ویرایش پیام");
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? data.message : message,
      ),
    );
    cancelEditMessage();
    await loadChats(activeChatId);
  }

  async function deleteMessage(messageId: string) {
    setMessageMenu(null);
    if (!activeChatId) {
      return;
    }
    const sure = window.confirm("این پیام حذف شود؟");
    if (!sure) {
      return;
    }

    const response = await fetch(
      `/api/chats/${activeChatId}/messages/${messageId}`,
      {
        method: "DELETE",
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "خطا در حذف پیام");
      return;
    }

    setMessages((current) =>
      current.filter((message) => message.id !== messageId),
    );
    await loadChats(activeChatId);
  }

  async function deleteMessageForMe(messageId: string) {
    setMessageMenu(null);
    if (!activeChatId) {
      return;
    }

    const response = await fetch(
      `/api/chats/${activeChatId}/messages/${messageId}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "me" }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "خطا در حذف پیام برای شما");
      return;
    }

    setMessages((current) =>
      current.filter((message) => message.id !== messageId),
    );
    await loadChats(activeChatId);
  }

  async function copyMessage(message: MessageItem) {
    setMessageMenu(null);
    const textToCopy = (message.text || "").trim();

    if (!textToCopy) {
      setStatus("برای فایل و تصویر از گزینه Download استفاده کنید.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        setStatus("متن کپی شد.");
        return;
      }
    } catch (error) {
      console.error("[teleir] copy text failed", error);
    }

    // Fallback without opening a prompt/modal.
    const textarea = document.createElement("textarea");
    textarea.value = textToCopy;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    setStatus(ok ? "متن کپی شد." : "کپی متن در این مرورگر مجاز نیست.");
  }

  async function forwardMessage(targetChatId: string) {
    await forwardSelectedMessages(targetChatId);
  }
  function getSafeMenuPosition(
    clientX: number,
    clientY: number,
    menuWidth = 220,
    menuHeight = 420,
  ) {
    const padding = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = clientX;
    let y = clientY;

    if (x + menuWidth + padding > viewportWidth) {
      x = viewportWidth - menuWidth - padding;
    }

    if (y + menuHeight + padding > viewportHeight) {
      y = viewportHeight - menuHeight - padding;
    }

    if (x < padding) x = padding;
    if (y < padding) y = padding;

    return { x, y };
  }
  function openMessageMenu(
    event: MouseEvent<HTMLElement>,
    message: MessageItem,
  ) {
    event.preventDefault();

    const isMine = isOwnMessage(message, currentUser);
    const hasText = Boolean(message.text?.trim());
    const hasAttachment = Boolean(message.attachment);

    let estimatedHeight = 300;

    if (isMine) estimatedHeight += 96;
    if (hasText) estimatedHeight += 48;
    if (hasAttachment) estimatedHeight += 48;

    const { x, y } = getSafeMenuPosition(
      event.clientX,
      event.clientY,
      220,
      estimatedHeight,
    );

    setMessageMenu({ message, x, y });
  }
  function startForwardMessage(message: MessageItem) {
    setMessageMenu(null);
    setForwardTargetIds([]);
    setForwardingMessage(message);
    void loadContacts();
  }

  function getDirectMessageState(message: MessageItem) {
    if (!directPeerId) {
      return "";
    }
    if (message.readBy?.includes(directPeerId)) {
      return "read";
    }
    if (message.deliveredTo?.includes(directPeerId)) {
      return "delivered";
    }
    return "sent";
  }

  function renderHighlighted(text: string, queryText: string) {
    if (!queryText.trim()) {
      return text;
    }
    const source = text || "";
    const q = queryText.trim();
    const lowerSource = source.toLowerCase();
    const lowerQ = q.toLowerCase();
    const nodes: Array<string | JSX.Element> = [];
    let cursor = 0;
    let key = 0;

    while (cursor < source.length) {
      const foundAt = lowerSource.indexOf(lowerQ, cursor);
      if (foundAt < 0) {
        nodes.push(source.slice(cursor));
        break;
      }
      if (foundAt > cursor) {
        nodes.push(source.slice(cursor, foundAt));
      }
      nodes.push(
        <mark key={`m-${key++}`}>
          {source.slice(foundAt, foundAt + q.length)}
        </mark>,
      );
      cursor = foundAt + q.length;
    }

    return nodes;
  }

  async function reactToMessage(message: MessageItem, emoji: string) {
    if (!activeChatId) return;
    setMessageMenu(null);
    const response = await fetch(
      `/api/chats/${activeChatId}/messages/${message.id}/react`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? { ...item, reactions: data.reactions || {} }
            : item,
        ),
      );
    }
    setMessageMenu(null);
  }

  function toggleMessageSelection(messageId: string) {
    setMessageMenu(null);
    setSelectedMessageIds((current) =>
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId],
    );
  }

  function startReplyMessage(message: MessageItem) {
    setMessageMenu(null);
    setReplyToMessage(message);
  }

  async function applyChatAction(
    action:
      | "mute"
      | "unmute"
      | "archive"
      | "unarchive"
      | "pin"
      | "unpin"
      | "pinChat"
      | "unpinChat"
      | "clearHistory"
      | "leave",
    messageId?: string,
  ) {
    if (!activeChatId) return;
    setMessageMenu(null);
    const response = await fetch(`/api/chats/${activeChatId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, messageId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "عملیات انجام نشد.");
      return;
    }
    setChatActionsOpen(false);
    await loadChats(activeChatId);
    if (action === "pin" || action === "unpin") await loadMessages(activeChatId);
    if (action === "clearHistory") setMessages([]);
    if (action === "leave") {
      setActiveChatId("");
      setMobilePane("list");
    }
  }

  async function loadChatProfile() {
    if (!activeChatId) return;
    const response = await fetch(`/api/chats/${activeChatId}/profile`, {
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "خطا در دریافت پروفایل گفتگو");
      return;
    }
    setChatProfile(data);
    setChatProfileOpen(true);
  }

  async function updateMember(
    userId: string,
    action: "promote" | "demote" | "remove",
  ) {
    if (!activeChatId) return;
    const response = await fetch(
      `/api/chats/${activeChatId}/members/${userId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "عملیات مدیریت عضو انجام نشد.");
      return;
    }
    await loadChatProfile();
    await loadChats(activeChatId);
  }


  async function pinSelectedMessage() {
    if (!activeChatId || selectedMessageIds.length !== 1) return;
    const messageId = selectedMessageIds[0];
    const isAlreadyPinned = activeChat?.pinnedMessageIds?.includes(messageId) || false;
    await applyChatAction(isAlreadyPinned ? "unpin" : "pin", messageId);
    setSelectedMessageIds([]);
  }

  async function deleteSelectedMessages(mode: "me" | "everyone") {
    if (!activeChatId || selectedMessageIds.length === 0) return;
    const response = await fetch(
      `/api/chats/${activeChatId}/messages/bulk-delete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: selectedMessageIds, mode }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error || "خطا در حذف پیام‌ها");
      return;
    }
    setMessages((current) =>
      current.filter((message) => !selectedMessageIds.includes(message.id)),
    );
    setSelectedMessageIds([]);
    await loadChats(activeChatId);
  }

  async function ensureForwardTargetChat(targetId: string) {
    if (targetId.startsWith("chat:")) {
      return targetId.slice(5);
    }
    if (targetId.startsWith("contact:")) {
      const email = targetId.slice(8);
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "direct", email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "ساخت گفتگوی مقصد انجام نشد.");
      }
      return data.chat.id as string;
    }
    throw new Error("مقصد فوروارد نامعتبر است.");
  }

  async function forwardSelectedMessagesToTarget(targetChatId: string) {
    if (!activeChatId) return null;
    const ids = selectedMessageIds.length
      ? selectedMessageIds
      : forwardingMessage
        ? [forwardingMessage.id]
        : [];
    if (ids.length === 0) return null;
    const response = await fetch("/api/chats/forward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceChatId: activeChatId,
        targetChatId,
        messageIds: ids,
        hideSender: hideForwardSender,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "خطا در فوروارد پیام");
    }
    return data;
  }

  async function submitForwardSelectedMessages() {
    if (forwardTargetIds.length === 0) {
      setStatus("حداقل یک مقصد برای فوروارد انتخاب کنید.");
      return;
    }
    setStatus("");
    try {
      let firstTargetChatId = "";
      for (const targetId of forwardTargetIds) {
        const targetChatId = await ensureForwardTargetChat(targetId);
        if (!firstTargetChatId) firstTargetChatId = targetChatId;
        await forwardSelectedMessagesToTarget(targetChatId);
      }
      setForwardingMessage(null);
      setSelectedMessageIds([]);
      setForwardTargetIds([]);
      setHideForwardSender(false);
      await loadChats(firstTargetChatId);
      if (firstTargetChatId) {
        setActiveChatId(firstTargetChatId);
        setMobilePane("chat");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "خطا در فوروارد پیام");
    }
  }

  async function forwardSelectedMessages(targetChatId: string) {
    try {
      await forwardSelectedMessagesToTarget(targetChatId);
      setForwardingMessage(null);
      setSelectedMessageIds([]);
      setForwardTargetIds([]);
      setHideForwardSender(false);
      await loadChats(targetChatId);
      setActiveChatId(targetChatId);
      setMobilePane("chat");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "خطا در فوروارد پیام");
    }
  }

  function handleDroppedFiles(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length) setSelectedFiles((current) => [...current, ...files]);
  }

  function handlePasteIntoComposer(event: ClipboardEvent<HTMLInputElement>) {
    const files = Array.from(event.clipboardData.files || []);
    if (files.length) {
      setSelectedFiles((current) => [...current, ...files]);
    }
  }

  function unlockPasscode() {
    const expected = localStorage.getItem("teleir-passcode") || "";
    if (!expected) {
      setPasscodeLocked(false);
      return;
    }
    const entered = window.prompt("Passcode");
    if (entered === expected) setPasscodeLocked(false);
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    await signOut({ callbackUrl: `${window.location.origin}/login` });
  }

  return (
    <section
      className={`telegram-shell ${mobilePane === "chat" ? "mobile-chat-open" : ""}`}
    >
      <aside className={`sidebar ${contactsOpen ? "contacts-open" : ""}`}>
        <div className="telegram-sidebar-top">
          <details
            className="telegram-menu-details"
            open={menuOpen}
            onToggle={(event) => setMenuOpen(event.currentTarget.open)}
          >
            <summary className="icon-btn" aria-label="Menu">
              <span />
              <span />
              <span />
            </summary>
            <div className="telegram-menu" role="menu">
              <div className="telegram-menu-profile">
                <BrandMark size="sm" className="brand-badge" />
                <div>
                  <strong>{currentUser.name}</strong>
                  <span>{currentUser.email}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setChatType("group");
                  setContactsOpen(false);
                  setMenuOpen(false);
                  setSelectedMemberUserIds([]);
                  void loadContacts();
                  document
                    .querySelector<HTMLElement>(".creator-box")
                    ?.classList.toggle("is-hidden-composer");
                }}
              >
                New Group
              </button>
              <a
                href="/app?contacts=1"
                onClick={(event) => {
                  event.preventDefault();
                  void openContactsPanel();
                }}
              >
                Contacts
              </a>
              <button
                type="button"
                onClick={() =>
                  setStatus(
                    "تماس صوتی/تصویری در نسخه وب آماده اتصال به WebRTC است، اما سرور signaling جداگانه نیاز دارد.",
                  )
                }
              >
                Calls
              </button>
              {savedChatId ? (
                <a
                  href={`/app?chat=${encodeURIComponent(savedChatId)}`}
                  onClick={(event) => handleChatLink(event, savedChatId)}
                >
                  Saved Messages
                </a>
              ) : (
                <button type="button" onClick={() => void openSavedMessages()}>
                  Saved Messages
                </button>
              )}
              <a href="/settings">Settings</a>
              {currentUser.role === "admin" ? (
                <a href="/admin">Admin Panel</a>
              ) : null}
              <button type="button" onClick={() => void handleLogout()}>
                Log Out
              </button>
            </div>
          </details>
          <div className="telegram-search">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                setQuery(value);
                void loadDirectory(value);
              }}
              placeholder="Search"
            />
          </div>
        </div>

        <form
          className="creator-box is-hidden-composer"
          onSubmit={handleCreateChat}
        >
          <div className="segmented">
            <button
              type="button"
              className={chatType === "direct" ? "active" : ""}
              onClick={() => setChatType("direct")}
            >
              خصوصی
            </button>
            <button
              type="button"
              className={chatType === "group" ? "active" : ""}
              onClick={() => {
                setChatType("group");
                void loadContacts();
              }}
            >
              گروه
            </button>
            <button
              type="button"
              className={chatType === "channel" ? "active" : ""}
              onClick={() => {
                setChatType("channel");
                void loadContacts();
              }}
            >
              کانال
            </button>
          </div>

          {chatType === "direct" ? (
            <label>
              <span>ایمیل طرف مقابل</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="user@example.com"
                required
              />
            </label>
          ) : (
            <>
              <label>
                <span>عنوان</span>
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="مثلا تیم فروش"
                  required
                />
              </label>
              <div className="contact-picker-box">
                <div className="contact-picker-head">
                  <span>انتخاب اعضا از مخاطبین</span>
                  <button type="button" onClick={() => void loadContacts()}>
                    به‌روزرسانی
                  </button>
                </div>
                <div className="contact-picker-list">
                  {contacts.map((item) => (
                    <label
                      key={`create-${item.userId}-${item.phone}`}
                      className="contact-picker-row"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMemberUserIds.includes(item.userId)}
                        onChange={() => toggleSelectedMember(item.userId)}
                      />
                      <div className="chat-avatar">
                        {item.name.slice(0, 1) || "T"}
                      </div>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.phone || item.email}</span>
                      </div>
                    </label>
                  ))}
                  {contacts.length === 0 ? (
                    <p className="empty-text">
                      اول مخاطبین را از بخش Contacts اضافه یا sync کنید.
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          )}

          <button className="primary-btn" type="submit">
            ساخت
          </button>
        </form>

        <div className={`directory-box ${query ? "is-searching telegram-global-search" : ""}`}>
          <div className="directory-list">
            {query ? (
              <>
                {globalSearchLoading ? <p className="empty-text">در حال جستجو...</p> : null}
                {globalSearchResults.chats.length ? <div className="search-section-title">گفتگوها، گروه‌ها و کانال‌ها</div> : null}
                {globalSearchResults.chats.map((chat) => (
                  <button
                    key={`search-chat-${chat.id}`}
                    className="directory-row"
                    type="button"
                    onClick={() => selectChat(chat.id)}
                  >
                    <div className={`chat-avatar ${chat.type}`}>{chat.title.slice(0, 1) || "T"}</div>
                    <div>
                      <strong>{chat.title}</strong>
                      <span>{chat.subtitle || chat.type}</span>
                    </div>
                  </button>
                ))}
                {globalSearchResults.contacts.length ? <div className="search-section-title">مخاطبین</div> : null}
                {globalSearchResults.contacts.map((user) => (
                  <button
                    key={`search-contact-${user.id}`}
                    className="directory-row"
                    type="button"
                    onClick={() => void startDirectChat(user.email)}
                  >
                    <div className="chat-avatar">{user.name.slice(0, 1) || "T"}</div>
                    <div>
                      <strong>{user.name}</strong>
                      <span>{user.phone || user.email}</span>
                    </div>
                  </button>
                ))}
                {globalSearchResults.messages.length ? <div className="search-section-title">پیام‌ها</div> : null}
                {globalSearchResults.messages.map((item) => (
                  <button
                    key={`search-message-${item.chatId}-${item.messageId}`}
                    className="directory-row search-message-row"
                    type="button"
                    onClick={async () => {
                      selectChat(item.chatId);
                      setChatSearchOpen(true);
                      setChatSearchQuery(query);
                    }}
                  >
                    <div className="chat-avatar">{item.chatTitle.slice(0, 1) || "M"}</div>
                    <div>
                      <strong>{item.chatTitle}</strong>
                      <span>{item.senderName}: {item.text}</span>
                    </div>
                  </button>
                ))}
                {!globalSearchLoading &&
                  !globalSearchResults.chats.length &&
                  !globalSearchResults.contacts.length &&
                  !globalSearchResults.messages.length ? (
                  <p className="empty-text">نتیجه‌ای پیدا نشد.</p>
                ) : null}
              </>
            ) : (
              <>
                {directory.map((user) => (
                  <button
                    key={user.id}
                    className="directory-row"
                    type="button"
                    onClick={() => void startDirectChat(user.email)}
                  >
                    <div className="chat-avatar">
                      {user.name.slice(0, 1) || "T"}
                    </div>
                    <div>
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                    </div>
                  </button>
                ))}
                {query.includes("@") ? (
                  <button
                    className="directory-row"
                    type="button"
                    onClick={() => void startDirectChat(query)}
                  >
                    <div className="chat-avatar direct">+</div>
                    <div>
                      <strong>Start chat</strong>
                      <span>{query}</span>
                    </div>
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
        {contactsOpen ? (
          <div className="contacts-box telegram-contacts">
            <div className="contacts-head">
              <strong>Contacts</strong>
              <div className="contacts-head-actions">
                <button
                  type="button"
                  onClick={() => void importContactsFromPhone()}
                  disabled={importingContacts}
                  title="Sync contacts"
                >
                  {importingContacts ? "..." : "⟳"}
                </button>
                <a href="/app" aria-label="Close contacts">
                  ×
                </a>
              </div>
            </div>
            <div className="manual-contact-row">
              <input
                value={manualContactPhone}
                onChange={(event) => setManualContactPhone(event.target.value)}
                placeholder="Add by phone number"
              />
              <button type="button" onClick={() => void addManualContact()}>
                افزودن
              </button>
            </div>
            <div className="directory-list contacts-list">
              {contacts.map((item) => (
                <button
                  key={`${item.userId}-${item.phone}`}
                  className="directory-row"
                  type="button"
                  onClick={() => void startDirectChat(item.email)}
                >
                  <div className="chat-avatar">
                    {item.name.slice(0, 1) || "T"}
                  </div>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.email}</span>
                  </div>
                </button>
              ))}
              {contacts.length === 0 ? (
                <p className="empty-text">موردی برای نمایش نیست.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          className="chat-list"
          onTouchStart={(event) => beginPullRefresh(event, "list")}
          onTouchMove={trackPullRefresh}
          onTouchEnd={() => void finishPullRefresh()}
          onTouchCancel={() => void finishPullRefresh()}
          onDrop={handleDroppedFiles}
          onDragOver={(event) => event.preventDefault()}
        >
          {pullPane === "list" || refreshingPane === "list" ? (
            <div className="pull-refresh-indicator">
              {refreshingPane === "list"
                ? "در حال به‌روزرسانی..."
                : "رها کنید برای به‌روزرسانی"}
            </div>
          ) : null}
          <div className="chat-folders">
            {[
              ["all", "All"],
              ["direct", "Private"],
              ["group", "Groups"],
              ["channel", "Channels"],
              ["archived", "Archive"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={activeFolder === key ? "active" : ""}
                onClick={() => setActiveFolder(key as typeof activeFolder)}
              >
                {label}
              </button>
            ))}
          </div>
          {visibleChats.map((chat) => (
            <a
              key={chat.id}
              className={`chat-row ${chat.id === activeChatId ? "selected" : ""} ${chat.type === "saved" ? "saved-chat" : ""} ${chat.pinnedMessageIds?.includes("__chat__") ? "is-pinned-chat" : ""}`}
              href={`/app?chat=${encodeURIComponent(chat.id)}`}
              onClick={(event) => handleChatLink(event, chat.id)}
              onContextMenu={(event) => openChatContextMenu(event, chat)}
            >
              <div className={`chat-avatar ${chat.type}`}>
                {chat.avatarUrl ? <img src={chat.avatarUrl} alt={chat.title || "Chat"} /> : chat.title?.slice(0, 1) || "T"}
              </div>
              <div className="chat-row-main">
                <div className="chat-row-title">
                  <strong>{chat.title || "بدون عنوان"}</strong>
                  <div className="chat-row-meta">
                    <time suppressHydrationWarning>
                      {formatChatTime(chat.lastMessageAt, "time")}
                    </time>
                    {chat.isMuted ? <span title="Muted">🔕</span> : null}
                    {chat.unreadCount ? (
                      <span className="chat-unread-badge">
                        {chat.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </div>
                <span>
                  {chat.pinnedMessageIds?.includes("__chat__") ? "📌 " : ""}
                  {chat.lastMessageText || chat.subtitle || "No messages yet"}
                </span>
              </div>
            </a>
          ))}
        </div>
      </aside>

      <section className={`chat-stage ${chatSearchOpen ? "is-chat-search-open" : ""} ${activePinnedMessage ? "has-pinned-message" : ""}`}>
        {!activeChat ? (
          <div className="no-chat-selected">
            <span>Select a chat to start messaging</span>
          </div>
        ) : (
          <>
            <header className="chat-head">
              <button
                className="mobile-back-btn"
                type="button"
                aria-label="Back to chats"
                onClick={() => setMobilePane("list")}
              >
                ‹
              </button>
              <button
                className="chat-head-user chat-head-profile-button"
                type="button"
                onClick={() => void loadChatProfile()}
              >
                <div className={`chat-avatar ${activeChat?.type || ""}`}>
                  {activeChat?.avatarUrl ? <img src={activeChat.avatarUrl} alt={activeChat.title || "Chat"} /> : activeChat?.title?.slice(0, 1) || "T"}
                </div>
                <div>
                  <strong>
                    {activeChat?.title || "یک گفتگو را انتخاب کنید"}
                  </strong>
                  <span>
                    {typingUsersText ||
                      (activeChat?.type === "direct"
                        ? peerPresence?.isOnline
                          ? "online"
                          : peerPresence?.lastSeenAt
                            ? `last seen ${formatChatTime(peerPresence.lastSeenAt)}`
                            : "last seen recently"
                        : activeChat?.subtitle || "online")}
                  </span>
                </div>
              </button>
              {activeChat &&
                (activeChat.type === "group" || activeChat.type === "channel") ? (
                <div className="inline-tools">
                  <input
                    value={memberEmails}
                    onChange={(event) => setMemberEmails(event.target.value)}
                    placeholder="افزودن عضو با ایمیل"
                  />
                  <button type="button" onClick={addMembers}>
                    افزودن عضو
                  </button>
                </div>
              ) : null}
              <div className="chat-head-actions">
                <button
                  type="button"
                  title="Search"
                  onClick={() => {
                    setChatSearchOpen((open) => !open);
                    setActiveSearchResult(0);
                  }}
                >
                  ⌕
                </button>
                <button
                  type="button"
                  title="More"
                  onClick={() => setChatActionsOpen((open) => !open)}
                >
                  ⋮
                </button>
              </div>
            </header>
            {chatSearchOpen ? (
              <div className="chat-search-bar">
                <input
                  value={chatSearchQuery}
                  onChange={(event) => {
                    setChatSearchQuery(event.target.value);
                    setActiveSearchResult(0);
                  }}
                  placeholder="جستجو در پیام‌های این گفتگو"
                />
                <span>
                  {searchMatches.length === 0
                    ? "۰"
                    : `${Math.min(activeSearchResult + 1, searchMatches.length)} / ${searchMatches.length}`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setActiveSearchResult((value) =>
                      searchMatches.length === 0
                        ? 0
                        : (value - 1 + searchMatches.length) %
                        searchMatches.length,
                    )
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveSearchResult((value) =>
                      searchMatches.length === 0
                        ? 0
                        : (value + 1) % searchMatches.length,
                    )
                  }
                >
                  ↓
                </button>
              </div>
            ) : null}

            {activePinnedMessage ? (
              <div className="pinned-message-bar">
                <button
                  type="button"
                  className="pinned-message-content"
                  onClick={() =>
                    messageRefs.current[activePinnedMessage.id]?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    })
                  }
                >
                  <strong>پیام پین‌شده</strong>
                  <span>{activePinnedMessage.text || activePinnedMessage.attachment?.name || "پیام"}</span>
                </button>
                <button
                  type="button"
                  className="pinned-message-close"
                  aria-label="Unpin message"
                  onClick={() => void applyChatAction("unpin", activePinnedMessage.id)}
                >
                  ×
                </button>
              </div>
            ) : null}

            <div
              className="message-stream"
              onTouchStart={(event) => beginPullRefresh(event, "chat")}
              onTouchMove={trackPullRefresh}
              onTouchEnd={() => void finishPullRefresh()}
              onTouchCancel={() => void finishPullRefresh()}
              onDrop={handleDroppedFiles}
              onDragOver={(event) => event.preventDefault()}
            >
              {pullPane === "chat" || refreshingPane === "chat" ? (
                <div className="pull-refresh-indicator">
                  {refreshingPane === "chat"
                    ? "در حال به‌روزرسانی..."
                    : "رها کنید برای به‌روزرسانی"}
                </div>
              ) : null}
              {messages.map((message) => {
                const matchIndex = searchMatches.findIndex(
                  (item) => item.message.id === message.id,
                );
                const isSearchMatch = matchIndex >= 0;
                const isCurrentMatch =
                  isSearchMatch && matchIndex === activeSearchResult;
                const own = isOwnMessage(message, currentUser);
                const selected = selectedMessageIds.includes(message.id);
                return (
                  <article
                    key={message.id}
                    ref={(element) => {
                      messageRefs.current[message.id] = element;
                    }}
                    data-own={own ? "true" : "false"}
                    className={`bubble ${own ? "mine" : "theirs"} ${selected ? "is-selected" : ""}`}
                    onContextMenu={(event) => openMessageMenu(event, message)}
                    onDoubleClick={(event) => openMessageMenu(event, message)}
                    onClick={() =>
                      selectedMessageIds.length
                        ? toggleMessageSelection(message.id)
                        : undefined
                    }
                    data-search-current={isCurrentMatch ? "true" : "false"}
                    data-search-match={isSearchMatch ? "true" : "false"}
                  >
                    {selectedMessageIds.length > 0 ? (
                      <span
                        className="message-select-indicator"
                        aria-hidden="true"
                      >
                        {selectedMessageIds.includes(message.id) ? "✓" : ""}
                      </span>
                    ) : null}
                    <div className="bubble-meta">
                      <strong>{message.senderName}</strong>
                    </div>
                    {message.replyTo ? (
                      <button
                        type="button"
                        className="reply-preview"
                        onClick={() =>
                          messageRefs.current[
                            message.replyTo?.messageId || ""
                          ]?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          })
                        }
                      >
                        <strong>{message.replyTo.senderName || "Reply"}</strong>
                        <span>{message.replyTo.text || "پیام"}</span>
                      </button>
                    ) : null}
                    {message.forwardedFrom ? (
                      <div className="forwarded-label">
                        Forwarded from{" "}
                        {message.forwardedFrom.senderName ||
                          message.forwardedFrom.senderEmail ||
                          "Unknown"}
                      </div>
                    ) : null}
                    {message.text ? (
                      <p>{renderHighlighted(message.text, chatSearchQuery)}</p>
                    ) : null}
                    {message.attachment ? (
                      <div className="attachment-card">
                        {message.attachment.isImage ? (
                          <button
                            type="button"
                            className="media-thumb-button"
                            onClick={() => setMediaPreview(message)}
                          >
                            <img
                              src={message.attachment.url}
                              alt={message.attachment.name}
                              className="attachment-image"
                            />
                          </button>
                        ) : (
                          <a
                            href={message.attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="attachment-file"
                          >
                            <strong>{message.attachment.name}</strong>
                            <span>
                              {Math.ceil(message.attachment.size / 1024)} KB
                            </span>
                          </a>
                        )}
                      </div>
                    ) : null}
                    {message.reactions &&
                      Object.keys(message.reactions).length ? (
                      <div className="reaction-row">
                        {Object.entries(message.reactions).map(
                          ([emoji, users]) =>
                            Array.isArray(users) && users.length ? (
                              <span key={emoji}>
                                {emoji} {users.length}
                              </span>
                            ) : null,
                        )}
                      </div>
                    ) : null}
                    <div className="bubble-foot">
                      <time suppressHydrationWarning>
                        {formatChatTime(message.createdAt)}
                        {message.editedAt ? " (ویرایش‌شده)" : ""}
                      </time>
                      {own &&
                        activeChat?.type === "direct" ? (
                        <span
                          className={`msg-state ${getDirectMessageState(message)}`}
                        >
                          {getDirectMessageState(message) === "read"
                            ? "✓✓"
                            : getDirectMessageState(message) === "delivered"
                              ? "✓"
                              : "✓"}
                        </span>
                      ) : null}
                      <button
                        className="message-more-btn"
                        type="button"
                        aria-label="Message actions"
                        onClick={(event) => openMessageMenu(event, message)}
                      >
                        ⋯
                      </button>
                    </div>
                  </article>
                );
              })}
              {messages.length === 0 ? (
                <div className="empty-chat">
                  <strong>شروع گفتگو</strong>
                  <span>اولین پیام را برای این گفتگو بفرستید.</span>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {selectedMessageIds.length > 0 ? (
              <div className="selection-bar">
                <strong>{selectedMessageIds.length} selected</strong>
                {selectedMessageIds.length === 1 ? (
                  <button type="button" onClick={() => void pinSelectedMessage()}>
                    {activeChat?.pinnedMessageIds?.includes(selectedMessageIds[0])
                      ? "Unpin"
                      : "Pin"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    const first = messages.find(
                      (m) => m.id === selectedMessageIds[0],
                    );
                    if (first) {
                      setForwardTargetIds([]);
                      setForwardingMessage(first);
                      void loadContacts();
                    }
                  }}
                >
                  Forward
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSelectedMessages("me")}
                >
                  Delete for me
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSelectedMessages("everyone")}
                >
                  Delete for everyone
                </button>
                <button type="button" onClick={() => setSelectedMessageIds([])}>
                  ×
                </button>
              </div>
            ) : null}

            {replyToMessage && !editingMessageId ? (
              <div className="edit-composer-bar reply-composer-bar">
                <div>
                  <strong>Reply to {replyToMessage.senderName}</strong>
                  <span>
                    {replyToMessage.text ||
                      replyToMessage.attachment?.name ||
                      "پیام"}
                  </span>
                </div>
                <button type="button" onClick={() => setReplyToMessage(null)}>
                  ×
                </button>
              </div>
            ) : null}

            {editingMessageId ? (
              <div className="edit-composer-bar">
                <div>
                  <strong>ویرایش پیام</strong>
                  <span>{editingText || "متن پیام"}</span>
                </div>
                <button type="button" onClick={cancelEditMessage}>
                  ×
                </button>
              </div>
            ) : null}

            {selectedFiles.length > 0 && !editingMessageId ? (
              <div
                className="selected-files selected-files-preview"
                aria-label="Selected files preview"
              >
                {selectedFiles.map((file, index) => {
                  const isImage = file.type.startsWith("image/");
                  const objectUrl = isImage ? URL.createObjectURL(file) : "";
                  return (
                    <div
                      className="selected-file-chip"
                      key={`${file.name}-${file.size}-${index}`}
                    >
                      {isImage ? (
                        <img
                          src={objectUrl}
                          alt={file.name}
                          onLoad={() => URL.revokeObjectURL(objectUrl)}
                        />
                      ) : (
                        <span className="selected-file-icon">📎</span>
                      )}
                      <div>
                        <span>{file.name}</span>
                        <small>{formatFileSize(file)}</small>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSelectedFile(index)}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <form
              className={`composer ${editingMessageId ? "is-editing" : ""}`}
              onSubmit={handleSendMessage}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="file-input"
                multiple
                onChange={handleFileSelect}
              />
              <button
                className="attach-btn"
                type="button"
                disabled={
                  !activeChat ||
                  uploading ||
                  Boolean(editingMessageId) ||
                  !canPostInActiveChat
                }
                title="ارسال فایل"
                onClick={() => fileInputRef.current?.click()}
              >
                +
              </button>
              <input
                value={composer}
                onPaste={handlePasteIntoComposer}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void sendCurrentMessage();
                  }
                }}
                onChange={(event) => {
                  setComposer(event.target.value);
                  if (editingMessageId) {
                    setEditingText(event.target.value);
                  }
                }}
                placeholder={
                  canPostInActiveChat || editingMessageId
                    ? "Message"
                    : "Only admins can post in this channel"
                }
                disabled={
                  !activeChat ||
                  uploading ||
                  (!canPostInActiveChat && !editingMessageId)
                }
              />
              <button
                className="send-btn"
                type="submit"
                disabled={
                  !activeChat ||
                  uploading ||
                  (!canPostInActiveChat && !editingMessageId)
                }
                title={editingMessageId ? "ذخیره ویرایش" : "ارسال"}
              >
                <span>➤</span>
              </button>
            </form>

            {status ? <p className="status-line">{status}</p> : null}
          </>
        )}
      </section>

      {chatActionsOpen && activeChat ? (
        <div className="chat-actions-popover">
          <button type="button" onClick={() => void loadChatProfile()}>
            Profile
          </button>
          <button
            type="button"
            onClick={() =>
              void applyChatAction(activeChat.isMuted ? "unmute" : "mute")
            }
          >
            {activeChat.isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            onClick={() =>
              void applyChatAction(
                activeChat.isArchived ? "unarchive" : "archive",
              )
            }
          >
            {activeChat.isArchived ? "Unarchive" : "Archive"}
          </button>
          <button type="button" onClick={() => void applyChatAction("unpin")}>
            Clear pinned messages
          </button>
          <button
            type="button"
            onClick={() => void applyChatAction("clearHistory")}
          >
            Clear history
          </button>
          {activeChat.type !== "saved" ? (
            <button
              type="button"
              className="danger"
              onClick={() => void applyChatAction("leave")}
            >
              Leave
            </button>
          ) : null}
        </div>
      ) : null}

      {chatProfileOpen && chatProfile ? (
        <div className="profile-modal" role="dialog" aria-modal="true">
          <div className="profile-card">
            <div className="profile-head">
              <div className={`chat-avatar ${activeChat?.type || ""}`}>
                {activeChat?.title?.slice(0, 1) || "T"}
              </div>
              <div>
                <strong>{activeChat?.title}</strong>
                <span>
                  {activeChat?.subtitle ||
                    `${chatProfile.members?.length || 0} members`}
                </span>
              </div>
              <button type="button" onClick={() => setChatProfileOpen(false)}>
                ×
              </button>
            </div>
            <div className="profile-sections">
              <section>
                <h3>Pinned messages</h3>
                {(chatProfile.pinned || []).map((item: any) => (
                  <button
                    key={item.id}
                    type="button"
                    className="profile-row"
                    onClick={() => {
                      setChatProfileOpen(false);
                      messageRefs.current[item.id]?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }}
                  >
                    <strong>{item.senderName}</strong>
                    <span>{item.text || "پیام"}</span>
                  </button>
                ))}
                {!(chatProfile.pinned || []).length ? (
                  <p className="empty-text">پیامی pin نشده است.</p>
                ) : null}
              </section>
              <section>
                <h3>Members</h3>
                {(chatProfile.members || []).map((member: any) => (
                  <div key={member.id} className="profile-row member-row">
                    <div>
                      <strong>{member.name}</strong>
                      <span>
                        {member.email}
                        {member.isAdmin ? " · admin" : ""}
                      </span>
                    </div>
                    {activeChat?.adminIds.includes(currentUser.id) &&
                      member.id !== currentUser.id ? (
                      <div className="member-actions">
                        <button
                          type="button"
                          onClick={() =>
                            void updateMember(
                              member.id,
                              member.isAdmin ? "demote" : "promote",
                            )
                          }
                        >
                          {member.isAdmin ? "Demote" : "Promote"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateMember(member.id, "remove")}
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </section>
              <section>
                <h3>Shared media</h3>
                <div className="profile-media-grid">
                  {(chatProfile.media || []).map((item: any) =>
                    item.attachment?.isImage ? (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          setMediaPreview({
                            ...item,
                            senderId: "",
                            senderName: "",
                            senderEmail: "",
                          })
                        }
                      >
                        <img
                          src={item.attachment.url}
                          alt={item.attachment.name}
                        />
                      </button>
                    ) : (
                      <a
                        key={item.id}
                        href={item.attachment?.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.attachment?.name}
                      </a>
                    ),
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {mediaPreview?.attachment ? (
        <div
          className="media-viewer"
          role="dialog"
          aria-modal="true"
          onClick={() => setMediaPreview(null)}
        >
          <button type="button" onClick={() => setMediaPreview(null)}>
            ×
          </button>
          <img
            src={mediaPreview.attachment.url}
            alt={mediaPreview.attachment.name}
          />
          <a
            href={mediaPreview.attachment.url}
            target="_blank"
            rel="noreferrer"
          >
            Download
          </a>
        </div>
      ) : null}

      {passcodeLocked ? (
        <div className="passcode-lock">
          <div>
            <strong>Teleir is locked</strong>
            <button type="button" onClick={unlockPasscode}>
              Unlock
            </button>
          </div>
        </div>
      ) : null}

      {messageMenu ? (
        <div
          className="message-menu-backdrop"
          onClick={() => setMessageMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMessageMenu(null);
          }}
        >
          <div
            className="message-context-menu"
            style={{ top: messageMenu.y, left: messageMenu.x }}
            role="menu"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => void reactToMessage(messageMenu.message, "👍")}
            >
              <span>React</span>
              <b>👍</b>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => toggleMessageSelection(messageMenu.message.id)}
            >
              <span>Select</span>
              <b>✓</b>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => startReplyMessage(messageMenu.message)}
            >
              <span>Reply</span>
              <b>↩</b>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                void applyChatAction(
                  activeChat?.pinnedMessageIds?.includes(messageMenu.message.id) ? "unpin" : "pin",
                  messageMenu.message.id,
                )
              }
            >
              <span>{activeChat?.pinnedMessageIds?.includes(messageMenu.message.id) ? "Unpin" : "Pin"}</span>
              <b>📌</b>
            </button>
            {messageMenu.message.text?.trim() ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => void copyMessage(messageMenu.message)}
              >
                <span>Copy</span>
                <b>⧉</b>
              </button>
            ) : null}
            {messageMenu.message.attachment ? (
              <a
                role="menuitem"
                className="message-menu-link"
                href={messageMenu.message.attachment.url}
                download={messageMenu.message.attachment.name}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMessageMenu(null)}
              >
                <span>Download</span>
                <b>⇩</b>
              </a>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => startForwardMessage(messageMenu.message)}
            >
              <span>Forward</span>
              <b>↗</b>
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => void deleteMessageForMe(messageMenu.message.id)}
            >
              <span>Delete for me</span>
              <b>⌫</b>
            </button>
            {isOwnMessage(messageMenu.message, currentUser) ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => startEditMessage(messageMenu.message)}
                >
                  <span>Edit</span>
                  <b>✎</b>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => void deleteMessage(messageMenu.message.id)}
                >
                  <span>Delete for everyone</span>
                  <b>⌫</b>
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {chatContextMenu ? (
        <div
          className="message-menu-backdrop"
          onClick={() => setChatContextMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setChatContextMenu(null);
          }}
        >
          <div
            className="message-context-menu chat-context-menu"
            style={{ top: chatContextMenu.y, left: chatContextMenu.x }}
            role="menu"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                void applyChatListAction(
                  chatContextMenu.chat.id,
                  chatContextMenu.chat.isArchived ? "unarchive" : "archive",
                )
              }
            >
              <span>
                {chatContextMenu.chat.isArchived ? "Unarchive" : "Archive"}
              </span>
              <b>🗄</b>
            </button>
            {chatContextMenu.chat.type !== "saved" ? (
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  void applyChatListAction(
                    chatContextMenu.chat.id,
                    chatContextMenu.chat.pinnedMessageIds?.includes("__chat__")
                      ? "unpinChat"
                      : "pinChat",
                  )
                }
              >
                <span>
                  {chatContextMenu.chat.pinnedMessageIds?.includes("__chat__")
                    ? "Unpin chat"
                    : "Pin chat"}
                </span>
                <b>📌</b>
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                void applyChatListAction(
                  chatContextMenu.chat.id,
                  chatContextMenu.chat.isMuted ? "unmute" : "mute",
                )
              }
            >
              <span>{chatContextMenu.chat.isMuted ? "Unmute" : "Mute"}</span>
              <b>🔕</b>
            </button>
          </div>
        </div>
      ) : null}

      {toast ? (
        <button
          type="button"
          className="telegram-toast"
          onClick={() => {
            if (toast.chatId) selectChat(toast.chatId);
            setToast(null);
          }}
        >
          <strong>{toast.title}</strong>
          <span>{toast.body}</span>
        </button>
      ) : null}

      {forwardingMessage ? (
        <div className="forward-modal" role="dialog" aria-modal="true">
          <div className="forward-card">
            <div className="forward-head">
              <strong>فوروارد به</strong>
              <button
                type="button"
                onClick={() => {
                  setForwardingMessage(null);
                  setForwardTargetIds([]);
                  setHideForwardSender(false);
                }}
              >
                ×
              </button>
            </div>
            <div className="forward-list">
              <label className="forward-option">
                <input
                  type="checkbox"
                  checked={hideForwardSender}
                  onChange={(event) =>
                    setHideForwardSender(event.target.checked)
                  }
                />{" "}
                Hide sender name
              </label>
              <div className="forward-section-title">گفتگوها</div>
              {chats
                .filter((chat) => chat.id !== activeChatId)
                .map((chat) => {
                  const targetId = `chat:${chat.id}`;
                  return (
                    <label
                      key={chat.id}
                      className="forward-row selectable-forward-row"
                    >
                      <input
                        type="checkbox"
                        checked={forwardTargetIds.includes(targetId)}
                        onChange={() => toggleForwardTarget(targetId)}
                      />
                      <div className={`chat-avatar ${chat.type}`}>
                        {chat.title?.slice(0, 1) || "T"}
                      </div>
                      <div>
                        <strong>{chat.title || "بدون عنوان"}</strong>
                        <span>
                          {chat.subtitle || chat.lastMessageText || ""}
                        </span>
                      </div>
                    </label>
                  );
                })}
              <div className="forward-section-title">مخاطبین</div>
              {contacts.map((item) => {
                const targetId = `contact:${item.email}`;
                return (
                  <label
                    key={`forward-${item.userId}-${item.phone}`}
                    className="forward-row selectable-forward-row"
                  >
                    <input
                      type="checkbox"
                      checked={forwardTargetIds.includes(targetId)}
                      onChange={() => toggleForwardTarget(targetId)}
                    />
                    <div className="chat-avatar">
                      {item.name.slice(0, 1) || "T"}
                    </div>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.phone || item.email}</span>
                    </div>
                  </label>
                );
              })}
              {chats.length <= 1 && contacts.length === 0 ? (
                <p className="empty-text">مقصدی برای فوروارد وجود ندارد.</p>
              ) : null}
            </div>
            <div className="forward-footer">
              <span>{forwardTargetIds.length} مقصد انتخاب شده</span>
              <button
                type="button"
                className="primary-btn"
                onClick={() => void submitForwardSelectedMessages()}
              >
                ارسال
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (() => {
              if (window.__teleirFallbackReady) return;
              window.__teleirFallbackReady = true;
              document.addEventListener("click", async (event) => {
                if (window.__teleirHydrated) return;
                const button = event.target?.closest?.("[data-fallback-action]");
                if (!button) return;
                event.preventDefault();
                const action = button.dataset.fallbackAction;
                const chatId = button.dataset.chatId;
                const messageId = button.dataset.messageId;
                try {
                  if (action === "copy") {
                    const text = button.dataset.copyText || "";
                    if (navigator.clipboard && text) {
                      await navigator.clipboard.writeText(text);
                      alert("کپی شد.");
                    } else if (text) {
                      prompt("برای کپی، متن زیر را بردارید:", text);
                    }
                    return;
                  }
                  if (!chatId || !messageId) return;
                  if (action === "delete") {
                    if (!confirm("این پیام حذف شود؟")) return;
                    const response = await fetch("/api/chats/" + chatId + "/messages/" + messageId, {
                      method: "DELETE"
                    });
                    if (!response.ok) throw new Error("delete failed");
                    location.reload();
                    return;
                  }
                  if (action === "edit") {
                    const nextText = prompt("متن جدید پیام:", button.dataset.messageText || "");
                    if (!nextText || !nextText.trim()) return;
                    const response = await fetch("/api/chats/" + chatId + "/messages/" + messageId, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ text: nextText.trim() })
                    });
                    if (!response.ok) throw new Error("edit failed");
                    location.reload();
                    return;
                  }
                  if (action === "forward") {
                    const rows = Array.from(document.querySelectorAll(".chat-row"));
                    const options = rows.map((row, index) => ({
                      index: index + 1,
                      id: new URL(row.href, location.href).searchParams.get("chat") || "",
                      title: row.querySelector("strong")?.textContent || "Chat"
                    })).filter((item) => item.id);
                    const picked = prompt(options.map((item) => item.index + ". " + item.title).join("\\n") + "\\n\\nشماره چت مقصد را وارد کنید:");
                    const target = options[Number(picked) - 1];
                    if (!target) return;
                    const response = await fetch("/api/chats/" + chatId + "/messages/" + messageId + "/forward", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ targetChatId: target.id })
                    });
                    if (!response.ok) throw new Error("forward failed");
                    location.href = "/app?chat=" + encodeURIComponent(target.id);
                  }
                } catch {
                  alert("عملیات انجام نشد. صفحه را رفرش کنید و دوباره تلاش کنید.");
                }
              });
            })();
          `,
        }}
      />
    </section>
  );
}
