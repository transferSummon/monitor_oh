import type { AdsFilters } from "@/lib/api";

const ALERTS_ENDPOINT = "/api/alerts";

export type NotificationType = "new_offer" | "updated_offer" | "removed_offer";
export type NotificationStatusFilter = "new" | "changed" | "removed";
export type NotificationSourceFilter = "offers" | "marketing";
export type NotificationCurrentStatus = "new" | "active" | "changed" | "removed";

export interface NotificationItem {
  id: string;
  offer_id?: string | null;
  type: NotificationType;
  status_filter: NotificationStatusFilter;
  source: NotificationSourceFilter;
  competitor_id?: string | null;
  competitor_name: string;
  destination_id?: string | null;
  destination_name: string | null;
  message: string;
  created_at: string;
  is_read: boolean;
  preview_image?: string | null;
  deep_link_url?: string | null;
  price_text?: string | null;
  current_status?: NotificationCurrentStatus | null;
}

export interface NotificationsResponse {
  alerts: NotificationItem[];
  unread_count: number;
  total_count: number;
  has_next_page: boolean;
}

export type NotificationFilters = Pick<
  AdsFilters,
  "status" | "competitor_id" | "destination_id" | "search" | "page" | "limit" | "sort" | "order"
> & {
  source?: NotificationSourceFilter;
};

const makeQueryString = (filters: object) => {
  const params = new URLSearchParams();
  Object.entries(filters as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  return params.toString();
};

export async function fetchNotifications(
  filters: NotificationFilters = {},
): Promise<NotificationsResponse> {
  const query = makeQueryString({
    sort: "created_at",
    order: "desc",
    ...filters,
  });
  const response = await fetch(query ? `${ALERTS_ENDPOINT}?${query}` : ALERTS_ENDPOINT, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch notifications: ${response.status}`);
  }

  const payload = (await response.json()) as {
    alerts: Array<{
      id: string;
      offerId: string | null;
      type: NotificationType;
      statusFilter: NotificationStatusFilter;
      source: NotificationSourceFilter;
      competitorId: string | null;
      competitorName: string;
      destinationId: string | null;
      destinationName: string | null;
      message: string;
      createdAt: string;
      isRead: boolean;
      previewImage: string | null;
      deepLinkUrl: string | null;
      priceText: string | null;
      currentStatus: NotificationCurrentStatus | null;
    }>;
    unreadCount: number;
    totalCount: number;
    hasNextPage: boolean;
  };

  return {
    alerts: payload.alerts.map((item) => ({
      id: item.id,
      offer_id: item.offerId,
      type: item.type,
      status_filter: item.statusFilter,
      source: item.source,
      competitor_id: item.competitorId,
      competitor_name: item.competitorName,
      destination_id: item.destinationId,
      destination_name: item.destinationName,
      message: item.message,
      created_at: item.createdAt,
      is_read: item.isRead,
      preview_image: item.previewImage,
      deep_link_url: item.deepLinkUrl,
      price_text: item.priceText,
      current_status: item.currentStatus,
    })),
    unread_count: payload.unreadCount,
    total_count: payload.totalCount,
    has_next_page: payload.hasNextPage,
  };
}

export async function resetNotifications(): Promise<void> {
  return Promise.resolve();
}
