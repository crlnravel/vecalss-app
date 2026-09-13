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
  page?: number;
  pageCount?: number;
  pageSize?: number;
  totalCount?: number;
};

export type { StudentNotificationFeed, StudentNotificationItem };
