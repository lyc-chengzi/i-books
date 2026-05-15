import { DatePicker, Input, Modal, Select, TimePicker, Typography } from 'antd';
import dayjs from 'dayjs';

import { type Direction } from './CommuteCardStore';

export type ReservationDraft = {
  rideDate: dayjs.Dayjs | null;
  departureTime: dayjs.Dayjs | null;
  trainNo: string;
  direction: Direction | null;
  carriageNo: string;
  seatNo: string;
};

const DIRECTION_OPTIONS: Array<{ label: Direction; value: Direction }> = [
  { label: '北京南-天津', value: '北京南-天津' },
  { label: '天津-北京南', value: '天津-北京南' }
];

export function toTimeValue(timeLike: string) {
  const [hour, minute] = timeLike.split(':').map(Number);
  return dayjs().hour(hour).minute(minute).second(0).millisecond(0);
}

export function getDefaultDepartureTime(direction: Direction) {
  return direction === '北京南-天津' ? '19:10' : '06:39';
}

export function createReservationDraft(direction: Direction, rideDate?: dayjs.Dayjs | null): ReservationDraft {
  return {
    rideDate: rideDate ?? dayjs(),
    departureTime: toTimeValue(getDefaultDepartureTime(direction)),
    trainNo: '',
    direction,
    carriageNo: '',
    seatNo: ''
  };
}

export function reservationToDraft(input: {
  rideDate: string;
  departureTime: string;
  trainNo?: string;
  direction: Direction;
  carriageNo?: string;
  seatNo?: string;
}): ReservationDraft {
  return {
    rideDate: dayjs(input.rideDate),
    departureTime: toTimeValue(input.departureTime),
    trainNo: input.trainNo ?? '',
    direction: input.direction,
    carriageNo: input.carriageNo ?? '',
    seatNo: input.seatNo ?? ''
  };
}

function RequiredLabel(props: { text: string }) {
  return (
    <span className="commuteFieldLabel">
      <span className="commuteFieldLabel__required">*</span>
      <span>{props.text}</span>
    </span>
  );
}

export function CommuteReservationModal(props: {
  title: string;
  open: boolean;
  okText: string;
  draft: ReservationDraft;
  onCancel: () => void;
  onOk: () => void;
  onDraftChange: (updater: (current: ReservationDraft) => ReservationDraft) => void;
}) {
  const { title, open, okText, draft, onCancel, onOk, onDraftChange } = props;

  return (
    <Modal title={title} open={open} onCancel={onCancel} onOk={onOk} okText={okText} cancelText="取消">
      <div className="commuteModalForm">
        <div>
          <Typography.Text strong>
            <RequiredLabel text="乘车方向" />
          </Typography.Text>
          <Select
            className="commuteModalForm__control"
            value={draft.direction ?? undefined}
            options={DIRECTION_OPTIONS}
            onChange={(value) => {
              const direction = value as Direction;
              onDraftChange((current) => ({
                ...current,
                direction,
                departureTime: toTimeValue(getDefaultDepartureTime(direction))
              }));
            }}
          />
        </div>

        <div className="commuteModalForm__split">
          <div>
            <Typography.Text strong>
              <RequiredLabel text="乘车日期" />
            </Typography.Text>
            <DatePicker
              className="commuteModalForm__control"
              value={draft.rideDate}
              onChange={(value) => onDraftChange((current) => ({ ...current, rideDate: value }))}
            />
          </div>

          <div>
            <Typography.Text strong>
              <RequiredLabel text="车次时间" />
            </Typography.Text>
            <TimePicker
              className="commuteModalForm__control"
              format="HH:mm"
              minuteStep={1}
              value={draft.departureTime}
              onChange={(value) => onDraftChange((current) => ({ ...current, departureTime: value }))}
            />
          </div>
        </div>

        <div className="commuteModalForm__triplet">
          <div>
            <Typography.Text strong>车次</Typography.Text>
            <Input
              className="commuteModalForm__control"
              placeholder="例如 G2004"
              value={draft.trainNo}
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  trainNo: event.target.value.toUpperCase()
                }))
              }
            />
          </div>

          <div>
            <Typography.Text strong>车厢</Typography.Text>
            <Input
              className="commuteModalForm__control"
              placeholder="例如 6"
              value={draft.carriageNo}
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  carriageNo: event.target.value
                }))
              }
            />
          </div>

          <div>
            <Typography.Text strong>座位号</Typography.Text>
            <Input
              className="commuteModalForm__control"
              placeholder="例如 1D"
              value={draft.seatNo}
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  seatNo: event.target.value.toUpperCase()
                }))
              }
            />
          </div>
        </div>

        <Typography.Text type="secondary">中午 12 点前会归入上午预约，12 点后会归入下午预约。</Typography.Text>
      </div>
    </Modal>
  );
}