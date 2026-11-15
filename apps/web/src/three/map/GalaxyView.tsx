/**
 * Совместимый реэкспорт карты Галактики (задачи 21–22; U40).
 *
 * Слот `viewport` теперь занимает `ViewportView`, который владеет общим
 * холстом и переключает карту и сцену системы. Старое имя сохранено для
 * тестов и внешнего кода задачи 21.
 */

export {
  ViewportView as GalaxyView,
  ViewportView as default,
  type ViewportViewProps as GalaxyViewProps,
} from '../../components/viewport/ViewportView';

export { isWebGLAvailable, type GalaxyRendererFactory } from '../../components/viewport/GalaxyPane';
