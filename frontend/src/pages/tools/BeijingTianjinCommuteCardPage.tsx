import {
  Badge,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { getApiErrorMessage } from '../../lib/api';

import {
  type CommuteCard,
  type CommuteReservation,
  type TripCount,
  getCommuteReservationSlot,
  useCommuteCardStore
} from './CommuteCardStore';
import {
  CommuteReservationModal,
  createReservationDraft,
  type ReservationDraft,
  reservationToDraft
} from './CommuteReservationModal';
import { CommuteReservationList, getReservationDateTime } from './CommuteReservationList';

import './beijing-tianjin-commute-card.css';

type CardDraft = {
  tripCount: TripCount;
  createdAt: dayjs.Dayjs;
};

type DecoratedCard = CommuteCard & {
  effectiveDate: string | null;
  expiryDate: string | null;
  reservations: CommuteReservation[];
  reservedCount: number;
  usedCount: number;
  pendingCount: number;
  remainingCount: number;
  status: 'draft' | 'active' | 'expired' | 'used-up';
};

const TRIP_COUNT_OPTIONS: Array<{ label: string; value: TripCount }> = [
  { label: '10次', value: 10 },
  { label: '20次', value: 20 },
  { label: '30次', value: 30 },
  { label: '40次', value: 40 }
];

function formatDate(dateLike?: string | null) {
  if (!dateLike) return '未生效';
  return dayjs(dateLike).format('YYYY-MM-DD');
}

function formatDateTime(dateLike: string) {
  return dayjs(dateLike).format('YYYY-MM-DD HH:mm');
}

function getDecoratedCards(cards: CommuteCard[], reservations: CommuteReservation[]): DecoratedCard[] {
  const now = dayjs();

  return cards
    .map((card) => {
      const cardReservations = reservations
        .filter((reservation) => reservation.cardId === card.id)
        .sort((left, right) => {
          const leftKey = `${left.rideDate} ${left.departureTime}`;
          const rightKey = `${right.rideDate} ${right.departureTime}`;
          return leftKey.localeCompare(rightKey);
        });

      const effectiveDate = cardReservations[0]?.rideDate ?? null;
      const expiryDate = effectiveDate ? dayjs(effectiveDate).add(29, 'day').format('YYYY-MM-DD') : null;
      const reservedCount = cardReservations.length;
      const usedCount = cardReservations.filter((reservation) => getReservationDateTime(reservation).isBefore(now)).length;
      const pendingCount = cardReservations.filter((reservation) => getReservationDateTime(reservation).isAfter(now)).length;
      const remainingCount = Math.max(0, card.tripCount - reservedCount);

      let status: DecoratedCard['status'] = 'draft';
      if (effectiveDate) {
        if (remainingCount === 0) status = 'used-up';
        else if (dayjs(expiryDate).isBefore(now, 'day')) status = 'expired';
        else status = 'active';
      }

      return {
        ...card,
        reservations: cardReservations,
        effectiveDate,
        expiryDate,
        reservedCount,
        usedCount,
        pendingCount,
        remainingCount,
        status
      };
    })
    .sort((left, right) => dayjs(right.createdAt).valueOf() - dayjs(left.createdAt).valueOf());
}

function getStatusMeta(status: DecoratedCard['status']) {
  switch (status) {
    case 'active':
      return { color: 'processing' as const, label: '生效中' };
    case 'expired':
      return { color: 'default' as const, label: '已过期' };
    case 'used-up':
      return { color: 'success' as const, label: '已用完' };
    default:
      return { color: 'warning' as const, label: '待首次预约' };
  }
}

function RequiredLabel(props: { text: string }) {
  return (
    <span className="commuteFieldLabel">
      <span className="commuteFieldLabel__required">*</span>
      <span>{props.text}</span>
    </span>
  );
}

export function BeijingTianjinCommuteCardPage() {
  const {
    cards,
    reservations,
    addCard,
    createReservation,
    updateReservation,
    deleteReservation: removeReservation,
    deleteCard: removeCard
  } = useCommuteCardStore();
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [managingCardId, setManagingCardId] = useState<number | null>(null);
  const [cardDraft, setCardDraft] = useState<CardDraft>({
    tripCount: 20,
    createdAt: dayjs()
  });
  const [reservationModalMode, setReservationModalMode] = useState<'create' | 'edit'>('create');
  const [editingReservationId, setEditingReservationId] = useState<number | null>(null);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [reservationDraft, setReservationDraft] = useState<ReservationDraft>(createReservationDraft('天津-北京南', null));
  const [messageApi, contextHolder] = message.useMessage();

  const decoratedCards = useMemo(() => getDecoratedCards(cards, reservations), [cards, reservations]);
  const managingCard = useMemo(
    () => decoratedCards.find((card) => card.id === managingCardId) ?? null,
    [decoratedCards, managingCardId]
  );

  useEffect(() => {
    if (!decoratedCards.length) {
      setManagingCardId(null);
      return;
    }

    if (managingCardId && !decoratedCards.some((card) => card.id === managingCardId)) {
      setManagingCardId(null);
    }
  }, [decoratedCards, managingCardId]);

  const openCreateCardModal = () => {
    setCardDraft({ tripCount: 20, createdAt: dayjs() });
    setIsCardModalOpen(true);
  };

  const submitCard = async () => {
    try {
      await addCard({ tripCount: cardDraft.tripCount, createdAt: cardDraft.createdAt.toISOString() });
      setIsCardModalOpen(false);
      messageApi.success('已添加通勤卡');
    } catch (err) {
      messageApi.error(getApiErrorMessage(err));
    }
  };

  const openCreateReservationModal = (card: DecoratedCard) => {
    setManagingCardId(card.id);

    setReservationModalMode('create');
    setEditingReservationId(null);
    setReservationDraft(createReservationDraft('天津-北京南', card.effectiveDate ? dayjs(card.effectiveDate) : dayjs()));
    setIsReservationModalOpen(true);
  };

  const openEditReservationModal = (reservation: CommuteReservation) => {
    setReservationModalMode('edit');
    setEditingReservationId(reservation.id);
    setReservationDraft(reservationToDraft(reservation));
    setIsReservationModalOpen(true);
  };

  const closeReservationModal = () => {
    setIsReservationModalOpen(false);
    setEditingReservationId(null);
  };

  const submitReservation = async () => {
    if (!managingCard) {
      messageApi.warning('请先选择一张通勤卡');
      return;
    }

    const { rideDate, departureTime, trainNo, direction, carriageNo, seatNo } = reservationDraft;
    if (!rideDate || !departureTime || !direction) {
      messageApi.error('请完整填写乘车日期、车次时间和乘车方向');
      return;
    }

    const normalizedRideDate = rideDate.format('YYYY-MM-DD');
    const normalizedDepartureTime = departureTime.format('HH:mm');
    const slot = getCommuteReservationSlot(normalizedDepartureTime);
    const conflict = reservations.find((reservation) => {
      if (reservation.id === editingReservationId) return false;
      return (
        reservation.rideDate === normalizedRideDate &&
        getCommuteReservationSlot(reservation.departureTime) === slot
      );
    });

    if (conflict) {
      messageApi.error(`该日期的${slot === 'am' ? '上午' : '下午'}已经有预约了`);
      return;
    }

    try {
      if (editingReservationId) {
        await updateReservation({
          reservationId: editingReservationId,
          rideDate: normalizedRideDate,
          departureTime: normalizedDepartureTime,
          direction,
          trainNo: trainNo.trim() || undefined,
          carriageNo: carriageNo.trim() || undefined,
          seatNo: seatNo.trim() || undefined
        });
      } else {
        await createReservation({
          cardId: managingCard.id,
          rideDate: normalizedRideDate,
          departureTime: normalizedDepartureTime,
          direction,
          trainNo: trainNo.trim() || undefined,
          carriageNo: carriageNo.trim() || undefined,
          seatNo: seatNo.trim() || undefined
        });
      }

      closeReservationModal();
      messageApi.success(editingReservationId ? '预约已更新' : '预约已添加');
    } catch (err) {
      messageApi.error(getApiErrorMessage(err));
    }
  };

  const deleteReservation = (reservation: CommuteReservation) => {
    Modal.confirm({
      title: '取消该条预约？',
      content: '取消后，这个座位预约会从当前卡片中移除。',
      okText: '取消预约',
      okButtonProps: { danger: true },
      cancelText: '保留',
      onOk: async () => {
        try {
          await removeReservation(reservation.id);
          messageApi.success('预约已取消');
        } catch (err) {
          messageApi.error(getApiErrorMessage(err));
        }
      }
    });
  };

  const deleteCard = (card: DecoratedCard) => {
    if (card.reservations.length > 0) {
      messageApi.warning('该通勤卡仍存在预约座位，必须先清空预约后才能删除');
      return;
    }

    Modal.confirm({
      title: '删除这张通勤卡？',
      content: '删除后仅移除卡片本身，不会影响其他通勤卡。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await removeCard(card.id);
          messageApi.success('通勤卡已删除');
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
          京津通勤卡
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateCardModal}>
          添加通勤卡
        </Button>
      </div>

      <div className="commuteCardPage__cards">
        {decoratedCards.length ? (
          decoratedCards.map((card) => {
            const statusMeta = getStatusMeta(card.status);

            return (
              <Card key={card.id} className="commuteCardTile">
                <div className="commuteCardTile__top">
                  <Badge status={statusMeta.color} text={statusMeta.label} />
                </div>

                <div className="commuteCardTile__main">
                  <div className="commuteCardTile__count">{card.tripCount}次卡</div>
                  <Typography.Text type="secondary" className="commuteCardTile__subtext">
                    <span className="commuteCardMetric commuteCardMetric--remaining">剩余 {card.remainingCount} 次</span>
                    <span className="commuteCardMetric commuteCardMetric--used">已使用 {card.usedCount} 次</span>
                    <span className="commuteCardMetric commuteCardMetric--pending">待使用 {card.pendingCount} 次</span>
                  </Typography.Text>
                </div>

                    <Tooltip
                      title={`剩余 ${card.remainingCount} 次 | 已使用 ${card.usedCount} 次 | 待使用 ${card.pendingCount} 次`}
                    >
                      <div className="commuteCardTile__progress" aria-label="通勤卡使用进度">
                        <div
                          className="commuteCardTile__progressSegment commuteCardTile__progressSegment--used"
                          style={{ width: `${(card.usedCount / card.tripCount) * 100}%` }}
                        />
                        <div
                          className="commuteCardTile__progressSegment commuteCardTile__progressSegment--pending"
                          style={{ width: `${(card.pendingCount / card.tripCount) * 100}%` }}
                        />
                        <div
                          className="commuteCardTile__progressSegment commuteCardTile__progressSegment--remaining"
                          style={{ width: `${(card.remainingCount / card.tripCount) * 100}%` }}
                        />
                      </div>
                    </Tooltip>

                <div className="commuteCardTile__actions">
                  <Tooltip title={card.reservations.length ? '查看和维护预约列表' : '当前还没有预约，可先添加'}>
                    <Button onClick={() => setManagingCardId(card.id)}>管理</Button>
                  </Tooltip>
                  <Button type="primary" onClick={() => openCreateReservationModal(card)}>
                    预约
                  </Button>
                </div>
              </Card>
            );
          })
        ) : (
          <div className="commuteCardPage__blankState">
            <Empty description="还没有通勤卡">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateCardModal}>
                添加第一张通勤卡
              </Button>
            </Empty>
          </div>
        )}
      </div>

      <Drawer
        title={managingCard ? `${managingCard.tripCount}次卡` : '预约管理'}
        placement="right"
        size="large"
        open={!!managingCard}
        onClose={() => setManagingCardId(null)}
        extra={
          managingCard ? (
            <Space>
              <Button onClick={() => openCreateReservationModal(managingCard)}>新增预约</Button>
              <Tooltip title={managingCard.reservations.length ? '请先删除全部预约，再删除通勤卡' : '删除当前通勤卡'}>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={managingCard.reservations.length > 0}
                  onClick={() => deleteCard(managingCard)}
                >
                  删除通勤卡
                </Button>
              </Tooltip>
            </Space>
          ) : null
        }
      >
        {managingCard ? (
          <div className="commuteDrawer">
            <Descriptions column={2} size="small" className="commuteDrawer__descriptions">
              <Descriptions.Item label="状态">
                <Badge status={getStatusMeta(managingCard.status).color} text={getStatusMeta(managingCard.status).label} />
              </Descriptions.Item>
              <Descriptions.Item label="剩余次数">
                <span className="commuteCardMetric commuteCardMetric--remaining">{managingCard.remainingCount} 次</span>
              </Descriptions.Item>
              <Descriptions.Item label="已预约">{managingCard.reservedCount} 次</Descriptions.Item>
              <Descriptions.Item label="已使用">
                <span className="commuteCardMetric commuteCardMetric--used">{managingCard.usedCount} 次</span>
              </Descriptions.Item>
              <Descriptions.Item label="待使用">
                <span className="commuteCardMetric commuteCardMetric--pending">{managingCard.pendingCount} 次</span>
              </Descriptions.Item>
              <Descriptions.Item label="添加时间">{formatDateTime(managingCard.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="生效日期">{formatDate(managingCard.effectiveDate)}</Descriptions.Item>
              <Descriptions.Item label="截止日期">{formatDate(managingCard.expiryDate)}</Descriptions.Item>
            </Descriptions>

            <Tooltip
              title={`剩余 ${managingCard.remainingCount} 次 | 已使用 ${managingCard.usedCount} 次 | 待使用 ${managingCard.pendingCount} 次`}
            >
              <div className="commuteCardTile__progress commuteDrawer__progress" aria-label="通勤卡使用进度">
                <div
                  className="commuteCardTile__progressSegment commuteCardTile__progressSegment--used"
                  style={{ width: `${(managingCard.usedCount / managingCard.tripCount) * 100}%` }}
                />
                <div
                  className="commuteCardTile__progressSegment commuteCardTile__progressSegment--pending"
                  style={{ width: `${(managingCard.pendingCount / managingCard.tripCount) * 100}%` }}
                />
                <div
                  className="commuteCardTile__progressSegment commuteCardTile__progressSegment--remaining"
                  style={{ width: `${(managingCard.remainingCount / managingCard.tripCount) * 100}%` }}
                />
              </div>
            </Tooltip>

            <div className="commuteDrawer__listHeader">
              <Typography.Title level={5} className="commuteDrawer__listTitle">
                预约列表
              </Typography.Title>
              <Tag variant="filled">{managingCard.reservations.length} 条</Tag>
            </div>

            {managingCard.reservations.length ? (
              <CommuteReservationList
                reservations={managingCard.reservations}
                emptyDescription="当前卡片还没有预约"
                emptyActionText="添加第一条预约"
                onEmptyAction={() => openCreateReservationModal(managingCard)}
                onEdit={openEditReservationModal}
                onDelete={deleteReservation}
              />
            ) : (
              <Empty description="当前卡片还没有预约" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <Button type="primary" onClick={() => openCreateReservationModal(managingCard)}>
                  添加第一条预约
                </Button>
              </Empty>
            )}
          </div>
        ) : null}
      </Drawer>

      <Modal
        title="添加通勤卡"
        open={isCardModalOpen}
        onCancel={() => setIsCardModalOpen(false)}
        onOk={submitCard}
        okText="保存"
        cancelText="取消"
      >
        <div className="commuteModalForm">
          <div>
            <Typography.Text strong>
              <RequiredLabel text="购买次数" />
            </Typography.Text>
            <Select
              className="commuteModalForm__control"
              value={cardDraft.tripCount}
              options={TRIP_COUNT_OPTIONS}
              onChange={(value) => setCardDraft((current) => ({ ...current, tripCount: value as TripCount }))}
            />
          </div>

          <div>
            <Typography.Text strong>添加时间</Typography.Text>
            <DatePicker
              className="commuteModalForm__control"
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
              value={cardDraft.createdAt}
              onChange={(value) => setCardDraft((current) => ({ ...current, createdAt: value ?? dayjs() }))}
            />
          </div>

          <Typography.Text type="secondary">生效日期和截止日期会在首次预约后自动生成。</Typography.Text>
        </div>
      </Modal>

      <CommuteReservationModal
        title={reservationModalMode === 'create' ? '新增预约座位' : '编辑预约座位'}
        open={isReservationModalOpen}
        onCancel={closeReservationModal}
        onOk={submitReservation}
        okText={reservationModalMode === 'create' ? '保存预约' : '更新预约'}
        draft={reservationDraft}
        onDraftChange={(updater) => setReservationDraft((current) => updater(current))}
      />
    </div>
  );
}
