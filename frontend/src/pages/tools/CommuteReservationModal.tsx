import { AutoComplete, DatePicker, Modal, Radio, Select, TimePicker, Typography } from 'antd';
import dayjs from 'dayjs';

import { type Direction } from './CommuteCardStore';

export type ReservationDraft = {
  rideDate: dayjs.Dayjs | null;
  departureTime: dayjs.Dayjs | null;
  trainNo: string;
  direction: Direction | null;
  carriageNo: string;
  seatNumber: string;
  seatLetter: string;
};

const DIRECTION_OPTIONS: Array<{ label: Direction; value: Direction }> = [
  { label: '北京南-天津', value: '北京南-天津' },
  { label: '天津-北京南', value: '天津-北京南' }
];

const TRAIN_OPTIONS: Record<Direction, string[]> = {
  '天津-北京南': ['C2204', 'G8952', 'C2552', 'C2002', 'C2554', 'C2004', 'C2206', 'C2208'],
  '北京南-天津': ['C2593', 'C2595', 'C2265', 'C2267', 'C2597']
};

const CARRIAGE_OPTIONS = Array.from({ length: 16 }, (_, index) => {
  const value = String(index + 1);
  return { label: `${value} 车`, value };
});

const SEAT_NUMBER_OPTIONS = Array.from({ length: 20 }, (_, index) => {
  const value = String(index + 1);
  return { label: value, value };
});

const SEAT_LETTER_OPTIONS = ['A', 'B', 'C', 'D', 'F'].map((value) => ({ label: value, value }));

export function toTimeValue(timeLike: string) {
  const [hour, minute] = timeLike.split(':').map(Number);
  return dayjs().hour(hour).minute(minute).second(0).millisecond(0);
}

export function getDefaultDepartureTime(direction: Direction) {
  return direction === '北京南-天津' ? '19:10' : '06:39';
}

function parseSeatNo(seatNo: string) {
  const normalized = seatNo.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2})([ABCDF])$/);
  if (!match) {
    return { seatNumber: undefined, seatLetter: undefined };
  }

  return {
    seatNumber: match[1],
    seatLetter: match[2]
  };
}

export function composeSeatNo(seatNumber?: string, seatLetter?: string) {
  if (!seatNumber || !seatLetter) {
    return '';
  }

  return `${seatNumber}${seatLetter}`;
}

export function createReservationDraft(direction: Direction, rideDate?: dayjs.Dayjs | null): ReservationDraft {
  return {
    rideDate: rideDate ?? dayjs(),
    departureTime: toTimeValue(getDefaultDepartureTime(direction)),
    trainNo: '',
    direction,
    carriageNo: '',
    seatNumber: '',
    seatLetter: 'F'
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
  const parsedSeat = parseSeatNo(input.seatNo ?? '');

  return {
    rideDate: dayjs(input.rideDate),
    departureTime: toTimeValue(input.departureTime),
    trainNo: input.trainNo ?? '',
    direction: input.direction,
    carriageNo: input.carriageNo ?? '',
    seatNumber: parsedSeat.seatNumber ?? '',
    seatLetter: parsedSeat.seatLetter ?? 'F'
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
  const trainOptions = draft.direction ? TRAIN_OPTIONS[draft.direction].map((value) => ({ value })) : [];

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
            <AutoComplete
              className="commuteModalForm__control"
              placeholder="可选择预置车次，也可手动输入"
              options={trainOptions}
              value={draft.trainNo}
              filterOption={(inputValue, option) =>
                String(option?.value ?? '')
                  .toUpperCase()
                  .includes(inputValue.toUpperCase())
              }
              onChange={(value) =>
                onDraftChange((current) => ({
                  ...current,
                  trainNo: String(value).toUpperCase()
                }))
              }
            />
          </div>

          <div>
            <Typography.Text strong>车厢</Typography.Text>
            <Select
              className="commuteModalForm__control"
              allowClear
              placeholder="选择车厢"
              options={CARRIAGE_OPTIONS}
              value={draft.carriageNo || undefined}
              onChange={(value) =>
                onDraftChange((current) => ({
                  ...current,
                  carriageNo: value ?? ''
                }))
              }
            />
          </div>
        </div>

        <div>
          <Typography.Text strong>座位号</Typography.Text>
          <Typography.Text type="secondary" className="commuteModalForm__seatHint">
            通过座位排号和字母组合选择
          </Typography.Text>

          <div className="commuteModalForm__seatRow">
            <Select
              className="commuteModalForm__control"
              allowClear
              placeholder="座位排号"
              options={SEAT_NUMBER_OPTIONS}
              value={draft.seatNumber || undefined}
              onChange={(value) =>
                onDraftChange((current) => ({
                  ...current,
                  seatNumber: value ?? ''
                }))
              }
            />

            <Radio.Group
              className="commuteModalForm__seatLetters"
              optionType="button"
              buttonStyle="solid"
              options={SEAT_LETTER_OPTIONS}
              value={draft.seatLetter}
              onChange={(value) =>
                onDraftChange((current) => ({
                  ...current,
                  seatLetter: String(value.target.value)
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