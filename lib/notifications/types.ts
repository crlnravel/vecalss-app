type StudentNotificationItem = {
  detail: string;
  external: boolean;
  href: string;
  id: string;
  time: string;
  title: string;
  unread: boolean;
};

type StudentNotificationFeed = {
  items: StudentNotificationItem[];
  unreadCount: number;
};

export type { StudentNotificationFeed, StudentNotificationItem };
