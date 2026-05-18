import {
  Button,
  Card,
  Modal,
  Select,
  Typography,
  message
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { getApiErrorMessage } from '../../lib/api';
import {
  type CommuteReservation,
  getCommuteReservationSlot,
  useCommuteCardStore
} from './CommuteCardStore';
import {
  CommuteReservationModal,
  composeSeatNo,
  createReservationDraft,
  type ReservationDraft,
  reservationToDraft
} from './CommuteReservationModal';
import { CommuteReservationList, getReservationTravelStatus } from './CommuteReservationList';

import './beijing-tianjin-commute-card.css';

type ReservationTravelFilter = 'upcoming' | 'completed' | 'all';

export function TicketCommutePage() {
  const {
    reservations,
    ticketReservations,
    createTicketReservation,
    updateReservation,
    deleteReservation
  } = useCommuteCardStore();
  const [messageApi, contextHolder] = message.useMessage();
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingReservationId, setEditingReservationId] = useState<number | null>(null);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [travelFilter, setTravelFilter] = useState<ReservationTravelFilter>('upcoming');
  const [reservationDraft, setReservationDraft] = useState<ReservationDraft>(createReservationDraft('天津-北京南', dayjs()));

  const sortedReservations = useMemo(
    () =>
      [...ticketReservations].sort((left, right) =>
        `${left.rideDate} ${left.departureTime}`.localeCompare(`${right.rideDate} ${right.departureTime}`)
      ),
    [ticketReservations]
  );

  const filteredReservations = useMemo(() => {
    if (travelFilter === 'all') {
      return sortedReservations;
    }

    return sortedReservations.filter((reservation) => {
      const isCompleted = getReservationTravelStatus(reservation).label === '已出行';
      return travelFilter === 'completed' ? isCompleted : !isCompleted;
    });
  }, [sortedReservations, travelFilter]);

  const emptyDescription =
    travelFilter === 'completed'
      ? '当前没有已出行的购票通勤预约'
      : travelFilter === 'all'
        ? '当前还没有购票通勤预约'
        : '当前没有未出行的购票通勤预约';

  const openCreateModal = () => {
    setModalMode('create');
    setEditingReservationId(null);
    setReservationDraft(createReservationDraft('天津-北京南', dayjs()));
    setIsReservationModalOpen(true);
  };

  const openEditModal = (reservation: CommuteReservation) => {
    setModalMode('edit');
    setEditingReservationId(reservation.id);
    setReservationDraft(reservationToDraft(reservation));
    setIsReservationModalOpen(true);
  };

  const closeModal = () => {
    setIsReservationModalOpen(false);
    setEditingReservationId(null);
  };

  const submitReservation = async () => {
    const { rideDate, departureTime, trainNo, direction, carriageNo, seatNumber, seatLetter } = reservationDraft;
    if (!rideDate || !departureTime || !direction) {
      messageApi.error('请完整填写乘车方向、乘车日期和车次时间');
      return;
    }

    const seatNo = composeSeatNo(seatNumber.trim() || undefined, seatLetter);

    const normalizedRideDate = rideDate.format('YYYY-MM-DD');
    const normalizedDepartureTime = departureTime.format('HH:mm');
    const slot = getCommuteReservationSlot(normalizedDepartureTime);
    const conflict = reservations.find((reservation) => {
      if (reservation.id === editingReservationId) return false;
      return reservation.rideDate === normalizedRideDate && getCommuteReservationSlot(reservation.departureTime) === slot;
    });

    if (conflict) {
      messageApi.error(`该日期的${slot === 'am' ? '上午' : '下午'}已经有预约了`);
      return;
    }

    try {
      if (editingReservationId) {
        await updateReservation({
          reservationId: editingReservationId,
          cardId: null,
          rideDate: normalizedRideDate,
          departureTime: normalizedDepartureTime,
          direction,
          trainNo: trainNo.trim() || undefined,
          carriageNo: carriageNo.trim() || undefined,
          seatNo: seatNo.trim() || undefined
        });
      } else {
        await createTicketReservation({
          rideDate: normalizedRideDate,
          departureTime: normalizedDepartureTime,
          direction,
          trainNo: trainNo.trim() || undefined,
          carriageNo: carriageNo.trim() || undefined,
          seatNo: seatNo.trim() || undefined
        });
      }
      closeModal();
      messageApi.success(editingReservationId ? '预约已更新' : '预约已添加');
    } catch (err) {
      messageApi.error(getApiErrorMessage(err));
    }
  };

  const removeTicketReservation = (reservation: CommuteReservation) => {
    Modal.confirm({
      title: '取消该条预约？',
      content: '取消后，这条购票通勤预约会从列表中移除。',
      okText: '取消预约',
      okButtonProps: { danger: true },
      cancelText: '保留',
      onOk: async () => {
        try {
          await deleteReservation(reservation.id);
          messageApi.success('预约已取消');
        } catch (err) {
          messageApi.error(getApiErrorMessage(err));
        }
      }
    });
  };

  return (
    <div className="commuteCardPage">
      {contextHolder}

      <div className="commuteCardPage__toolbar">
        <Typography.Title level={3} className="commuteCardPage__title">
          购票通勤
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          添加预约
        </Button>
      </div>

      <Card>
        <div className="commuteCardPage__toolbar commuteCardPage__toolbar--inner">
          <Typography.Text type="secondary">默认只显示未出行预约</Typography.Text>
          <Select<ReservationTravelFilter>
            value={travelFilter}
            style={{ width: 160 }}
            onChange={setTravelFilter}
            options={[
              { label: '未出行', value: 'upcoming' },
              { label: '已出行', value: 'completed' },
              { label: '全部', value: 'all' }
            ]}
          />
        </div>

        <CommuteReservationList
          reservations={filteredReservations}
          emptyDescription={emptyDescription}
          emptyActionText="添加第一条预约"
          onEmptyAction={openCreateModal}
          onEdit={openEditModal}
          onDelete={removeTicketReservation}
        />
      </Card>

      <CommuteReservationModal
        title={modalMode === 'create' ? '新增购票通勤预约' : '编辑购票通勤预约'}
        open={isReservationModalOpen}
        onCancel={closeModal}
        onOk={submitReservation}
        okText={modalMode === 'create' ? '保存预约' : '更新预约'}
        draft={reservationDraft}
        onDraftChange={(updater) => setReservationDraft((current) => updater(current))}
      />
    </div>
  );
}