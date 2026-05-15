import dayjs from 'dayjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo } from 'react';

import { useAuth } from '../../auth/useAuth';
import { api } from '../../lib/api';

export type TripCount = 10 | 20 | 30 | 40;
export type Direction = '北京南-天津' | '天津-北京南';
export type CommuteSlot = 'am' | 'pm';

export type CommuteCard = {
  id: number;
  tripCount: TripCount;
  createdAt: string;
};

export type CommuteReservation = {
  id: number;
  cardId: number | null;
  rideDate: string;
  departureTime: string;
  trainNo?: string;
  direction: Direction;
  carriageNo?: string;
  seatNo?: string;
  createdAt: string;
};

type CommuteCardStoreValue = {
  cards: CommuteCard[];
  ticketReservations: CommuteReservation[];
  reservations: CommuteReservation[];
  addCard: (input: { tripCount: TripCount; createdAt: string }) => Promise<CommuteCard>;
  createReservation: (input: {
    cardId: number;
    rideDate: string;
    departureTime: string;
    direction: Direction;
    trainNo?: string;
    carriageNo?: string;
    seatNo?: string;
  }) => Promise<CommuteReservation>;
  createTicketReservation: (input: {
    rideDate: string;
    departureTime: string;
    direction: Direction;
    trainNo?: string;
    carriageNo?: string;
    seatNo?: string;
  }) => Promise<CommuteReservation>;
  updateReservation: (input: {
    reservationId: number;
    cardId?: number | null;
    rideDate: string;
    departureTime: string;
    direction: Direction;
    trainNo?: string;
    carriageNo?: string;
    seatNo?: string;
  }) => Promise<CommuteReservation>;
  deleteReservation: (reservationId: number) => Promise<void>;
  deleteCard: (cardId: number) => Promise<void>;
};

const CommuteCardStoreContext = createContext<CommuteCardStoreValue | null>(null);

type CommuteReservationApi = {
  id: number;
  card_id: number | null;
  ride_date: string;
  departure_time: string;
  train_no?: string | null;
  direction: Direction;
  carriage_no?: string | null;
  seat_no?: string | null;
  created_at: string;
};

type CommuteCardApi = {
  id: number;
  trip_count: TripCount;
  created_at: string;
  effective_date?: string | null;
  expiry_date?: string | null;
  used_count: number;
  remaining_count: number;
  status: 'draft' | 'active' | 'expired' | 'used-up';
  reservations: CommuteReservationApi[];
};

type CommuteCardListApi = {
  items: CommuteCardApi[];
};

type TicketCommuteListApi = {
  items: CommuteReservationApi[];
};

function normalizeUtcNaiveTimestamp(dateTimeLike: string): string {
  if (!dateTimeLike) return dateTimeLike;

  const normalized = dateTimeLike.includes(' ') ? dateTimeLike.replace(' ', 'T') : dateTimeLike;
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
}

function mapReservation(apiReservation: CommuteReservationApi): CommuteReservation {
  return {
    id: apiReservation.id,
    cardId: apiReservation.card_id,
    rideDate: apiReservation.ride_date,
    departureTime: apiReservation.departure_time,
    trainNo: apiReservation.train_no ?? undefined,
    direction: apiReservation.direction,
    carriageNo: apiReservation.carriage_no ?? undefined,
    seatNo: apiReservation.seat_no ?? undefined,
    createdAt: normalizeUtcNaiveTimestamp(apiReservation.created_at)
  };
}

function mapCard(apiCard: CommuteCardApi): CommuteCard {
  return {
    id: apiCard.id,
    tripCount: apiCard.trip_count,
    createdAt: normalizeUtcNaiveTimestamp(apiCard.created_at)
  };
}

export function getCommuteReservationSlot(departureTime: string): CommuteSlot {
  const [hour] = departureTime.split(':').map(Number);
  return hour < 12 ? 'am' : 'pm';
}

export function formatCommuteReservationTime(timeLike: string) {
  return dayjs(`2000-01-01T${timeLike}`).format('H:mm');
}

export function CommuteCardStoreProvider(props: { children: React.ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const overviewQuery = useQuery({
    queryKey: ['tools', 'commute-cards'],
    enabled: !!auth.user,
    queryFn: () => api.get<CommuteCardListApi>('/tools/commute-cards', { token: auth.token })
  });

  const ticketCommutesQuery = useQuery({
    queryKey: ['tools', 'ticket-commutes'],
    enabled: !!auth.user,
    queryFn: () => api.get<TicketCommuteListApi>('/tools/ticket-commutes', { token: auth.token })
  });

  const cards = useMemo(
    () => (overviewQuery.data?.items ?? []).map((item) => mapCard(item)),
    [overviewQuery.data]
  );

  const reservations = useMemo(
    () =>
      [
        ...(overviewQuery.data?.items ?? []).flatMap((item) => item.reservations),
        ...(ticketCommutesQuery.data?.items ?? [])
      ]
        .map((item) => mapReservation(item))
        .sort((left, right) =>
          `${left.rideDate} ${left.departureTime}`.localeCompare(`${right.rideDate} ${right.departureTime}`)
        ),
    [overviewQuery.data, ticketCommutesQuery.data]
  );

  const ticketReservations = useMemo(
    () => reservations.filter((reservation) => reservation.cardId === null),
    [reservations]
  );

  const value = useMemo<CommuteCardStoreValue>(
    () => ({
      cards,
      ticketReservations,
      reservations,
      addCard: async (input) => {
        const created = await api.post<CommuteCardApi>(
          '/tools/commute-cards',
          { trip_count: input.tripCount, created_at: input.createdAt },
          { token: auth.token }
        );
        await queryClient.invalidateQueries({ queryKey: ['tools', 'commute-cards'] });
        return mapCard(created);
      },
      createReservation: async (input) => {
        const created = await api.post<CommuteReservationApi>(
          `/tools/commute-cards/${input.cardId}/reservations`,
          {
            ride_date: input.rideDate,
            departure_time: input.departureTime,
            direction: input.direction,
            train_no: input.trainNo,
            carriage_no: input.carriageNo,
            seat_no: input.seatNo
          },
          { token: auth.token }
        );
        await queryClient.invalidateQueries({ queryKey: ['tools', 'commute-cards'] });
        return mapReservation(created);
      },
      createTicketReservation: async (input) => {
        const created = await api.post<CommuteReservationApi>(
          '/tools/ticket-commutes/reservations',
          {
            ride_date: input.rideDate,
            departure_time: input.departureTime,
            direction: input.direction,
            train_no: input.trainNo,
            carriage_no: input.carriageNo,
            seat_no: input.seatNo
          },
          { token: auth.token }
        );
        await queryClient.invalidateQueries({ queryKey: ['tools', 'ticket-commutes'] });
        return mapReservation(created);
      },
      updateReservation: async (input) => {
        const path =
          input.cardId === null
            ? `/tools/ticket-commutes/reservations/${input.reservationId}`
            : `/tools/commute-cards/reservations/${input.reservationId}`;
        const updated = await api.patch<CommuteReservationApi>(
          path,
          {
            ride_date: input.rideDate,
            departure_time: input.departureTime,
            direction: input.direction,
            train_no: input.trainNo,
            carriage_no: input.carriageNo,
            seat_no: input.seatNo
          },
          { token: auth.token }
        );
        await queryClient.invalidateQueries({ queryKey: ['tools', input.cardId === null ? 'ticket-commutes' : 'commute-cards'] });
        return mapReservation(updated);
      },
      deleteReservation: async (reservationId) => {
        const reservation = reservations.find((item) => item.id === reservationId);
        const path =
          reservation?.cardId === null
            ? `/tools/ticket-commutes/reservations/${reservationId}`
            : `/tools/commute-cards/reservations/${reservationId}`;
        await api.delete(path, { token: auth.token });
        await queryClient.invalidateQueries({ queryKey: ['tools', reservation?.cardId === null ? 'ticket-commutes' : 'commute-cards'] });
      },
      deleteCard: async (cardId) => {
        await api.delete(`/tools/commute-cards/${cardId}`, { token: auth.token });
        await queryClient.invalidateQueries({ queryKey: ['tools', 'commute-cards'] });
      }
    }),
    [auth.token, cards, queryClient, reservations, ticketReservations]
  );

  return <CommuteCardStoreContext.Provider value={value}>{props.children}</CommuteCardStoreContext.Provider>;
}

export function useCommuteCardStore() {
  const value = useContext(CommuteCardStoreContext);
  if (!value) {
    throw new Error('useCommuteCardStore must be used within CommuteCardStoreProvider');
  }
  return value;
}