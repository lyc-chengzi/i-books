import { ClockCircleOutlined, RightOutlined, SwapOutlined } from '@ant-design/icons';
import { Button, Empty, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

import { type CommuteReservation, formatCommuteReservationTime, getCommuteReservationSlot } from './CommuteCardStore';

export function formatCommuteReservationDateTime(dateLike: string) {
  return dayjs(dateLike).format('YYYY-MM-DD HH:mm');
}

export function getReservationDateTime(reservation: CommuteReservation) {
  return dayjs(`${reservation.rideDate}T${reservation.departureTime}`);
}

export function getReservationTravelStatus(reservation: CommuteReservation) {
  return getReservationDateTime(reservation).isBefore(dayjs())
    ? { color: 'success' as const, label: '已出行' }
    : { color: 'magenta' as const, label: '未出行' };
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
      {reservations.map((reservation) => {
        const slot = getCommuteReservationSlot(reservation.departureTime);
        const travelStatus = getReservationTravelStatus(reservation);

        return (
          <div key={reservation.id} className="reservationListItem">
            <div className="reservationRow">
              <div className="reservationRow__main">
                <div className="reservationRow__headline">
                  <Tag color={slot === 'am' ? 'blue' : 'orange'}>{slot === 'am' ? '上午' : '下午'}</Tag>
                  <Tag color={travelStatus.color}>{travelStatus.label}</Tag>
                  <Typography.Text strong>{reservation.rideDate}</Typography.Text>
                  <Typography.Text className="reservationRow__time">
                    {formatCommuteReservationTime(reservation.departureTime)}
                  </Typography.Text>
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
  );
}