import { ClockCircleOutlined, RightOutlined, SwapOutlined } from '@ant-design/icons';
import { Button, Empty, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

import { type CommuteReservation, formatCommuteReservationTime, getCommuteReservationSlot } from './CommuteCardStore';

export function formatCommuteReservationDateTime(dateLike: string) {
  return dayjs(dateLike).format('YYYY-MM-DD HH:mm');
}

export function getReservationGroupMeta(rideDate: string) {
  const targetDate = dayjs(rideDate);
  const today = dayjs().startOf('day');
  const diffDays = targetDate.startOf('day').diff(today, 'day');
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekday = weekdays[targetDate.day()];

  if (diffDays === 0) {
    return `${weekday} · 今天`;
  }

  if (diffDays === 1) {
    return `${weekday} · 明天`;
  }

  if (diffDays === -1) {
    return `${weekday} · 昨天`;
  }

  return weekday;
}

export function getReservationDateTime(reservation: CommuteReservation) {
  return dayjs(`${reservation.rideDate}T${reservation.departureTime}`);
}

export function getReservationTravelStatus(reservation: CommuteReservation) {
  return getReservationDateTime(reservation).isBefore(dayjs())
    ? { label: '已出行', className: 'reservationListItem--completed' }
    : { label: '未出行', className: 'reservationListItem--upcoming' };
}

export function CommuteReservationList(props: {
  reservations: CommuteReservation[];
  emptyDescription: string;
  emptyActionText: string;
  onEmptyAction: () => void;
  onEdit: (reservation: CommuteReservation) => void;
  onDelete: (reservation: CommuteReservation) => void;
}) {
  const { reservations, emptyDescription, emptyActionText, onEmptyAction, onEdit, onDelete } = props;

  const groupedReservations = reservations.reduce<Array<{ rideDate: string; items: Array<{ reservation: CommuteReservation; index: number }> }>>(
    (groups, reservation, index) => {
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.rideDate !== reservation.rideDate) {
        groups.push({ rideDate: reservation.rideDate, items: [{ reservation, index: index + 1 }] });
        return groups;
      }

      lastGroup.items.push({ reservation, index: index + 1 });
      return groups;
    },
    []
  );

  if (!reservations.length) {
    return (
      <Empty description={emptyDescription} image={Empty.PRESENTED_IMAGE_SIMPLE}>
        <Button type="primary" onClick={onEmptyAction}>
          {emptyActionText}
        </Button>
      </Empty>
    );
  }

  return (
    <div className="commuteReservationList">
      {groupedReservations.map((group) => (
        <section key={group.rideDate} className="reservationGroup">
          <div className="reservationGroup__header">
            <div className="reservationGroup__titleWrap">
              <Typography.Text strong className="reservationGroup__title">
                {group.rideDate}
              </Typography.Text>
              <Typography.Text className="reservationGroup__hint">{getReservationGroupMeta(group.rideDate)}</Typography.Text>
            </div>
            <Typography.Text type="secondary" className="reservationGroup__count">
              {group.items.length} 条预约
            </Typography.Text>
          </div>

          <div className="reservationGroup__list">
            {group.items.map(({ reservation, index }) => {
              const slot = getCommuteReservationSlot(reservation.departureTime);
              const travelStatus = getReservationTravelStatus(reservation);

              return (
                <div key={reservation.id} className={`reservationListItem ${travelStatus.className}`}>
                  <div className="reservationRow">
                    <div className="reservationRow__index">{index}</div>

                    <div className="reservationRow__main">
                      <div className="reservationRow__headline">
                        <Tag color={slot === 'am' ? 'blue' : 'orange'}>{slot === 'am' ? '上午' : '下午'}</Tag>
                        <Typography.Text className="reservationRow__time">
                          {formatCommuteReservationTime(reservation.departureTime)}
                        </Typography.Text>
                        <Typography.Text className="reservationRow__statusText">{travelStatus.label}</Typography.Text>
                      </div>

                      <Space wrap size={[8, 8]} className="reservationRow__tags">
                        {reservation.trainNo ? <Tag>{reservation.trainNo}</Tag> : null}
                        <Tag icon={<SwapOutlined />}>{reservation.direction}</Tag>
                        {reservation.carriageNo ? <Tag icon={<RightOutlined />}>{reservation.carriageNo} 车</Tag> : null}
                        {reservation.seatNo ? <Tag>{reservation.seatNo}</Tag> : null}
                      </Space>
                    </div>

                    <div className="reservationRow__side">
                      <div className="reservationRow__meta">
                        <ClockCircleOutlined />
                        <span>创建于 {formatCommuteReservationDateTime(reservation.createdAt)}</span>
                      </div>
                      <Space size={4}>
                        <Button type="link" onClick={() => onEdit(reservation)}>
                          编辑
                        </Button>
                        <Button type="link" danger onClick={() => onDelete(reservation)}>
                          取消预约
                        </Button>
                      </Space>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}