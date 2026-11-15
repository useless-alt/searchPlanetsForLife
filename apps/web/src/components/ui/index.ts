/**
 * Библиотека базовых компонентов (задача 12a).
 *
 * Один набор компонентов на всё приложение: экраны задач 13–29 собираются
 * только из них, чтобы интерфейс оставался одной системой (system.md).
 */

export { Badge } from './Badge';
export type { BadgeKind, BadgeProps } from './Badge';

export { Banner } from './Banner';
export type { BannerProps, BannerTone } from './Banner';

export { Button } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';

export { Checkbox } from './Checkbox';
export type { CheckboxProps } from './Checkbox';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { Input } from './Input';
export type { InputProps, InputType } from './Input';

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

export { Panel } from './Panel';
export type { PanelProps, PanelSide } from './Panel';

export { RangeInput } from './RangeInput';
export type { RangeInputProps, RangeValue } from './RangeInput';

export { SegmentedControl } from './SegmentedControl';
export type { SegmentedControlOption, SegmentedControlProps } from './SegmentedControl';

export { Slider } from './Slider';
export type { SliderProps } from './Slider';

export { Spinner } from './Spinner';
export type { SpinnerProps, SpinnerSize } from './Spinner';

export { TOAST_DURATION_MS, ToastHost, dismissToast, resetToasts, showToast } from './Toast';
export type { ToastItem } from './Toast';

export {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableNumberCell,
  TableRow,
} from './TableParts';
export type {
  TableCellProps,
  TableHeaderCellProps,
  TableNumberCellProps,
  TableProps,
  TableSortDirection,
} from './TableParts';
