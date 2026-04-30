import {
  type FlipOptions,
  type Middleware,
  type ShiftOptions,
  type UseFloatingOptions,
  arrow,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react-native";
import {
  type RefObject,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  Animated,
  type LayoutRectangle,
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import { vh, vw } from "../../../helpers/responsive";
import {
  type BackdropPressBehavior,
  type Motion,
  type OSConfig,
  type Shape,
  type ShapeOptions,
  SpotlightTourContext,
  type TooltipProps,
  type TourStep,
} from "../../SpotlightTour.context";

import { Css, DEFAULT_ARROW, arrowCss } from "./TourOverlay.styles";

import type { Optional, ToOptional } from "../../../helpers/common";

import {
  Canvas,
  Color,
  Group,
  Path,
  Rect,
  Skia,
} from "@shopify/react-native-skia";

import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";


export interface TourOverlayRef {
  hideTooltip: () => Promise<Animated.EndResult>;
}

interface TourOverlayProps extends ToOptional<TooltipProps> {
  backdropOpacity: number;
  color: Color;
  current: Optional<number>;
  motion: Motion;
  nativeDriver: boolean | OSConfig<boolean>;
  onBackdropPress: Optional<BackdropPressBehavior>;
  shape: Shape | ShapeOptions;
  spot: LayoutRectangle;
  tourStep: TourStep;
}

export const TourOverlay = forwardRef<TourOverlayRef, TourOverlayProps>((props, ref) => {
  const {
    backdropOpacity,
    color,
    current,
    motion,
    nativeDriver,
    onBackdropPress,
    shape,
    spot,
    tourStep,
    ...tooltipProps
  } = props;

  const { goTo, next, pause, previous, resume, start, steps, stop } = useContext(SpotlightTourContext);
  const arrowRef = useRef<View>(null);

  const floating = useMemo((): TooltipProps => ({
    arrow: tourStep.arrow ?? tooltipProps.arrow,
    flip: tourStep.flip ?? tooltipProps.flip,
    offset: tourStep.offset ?? tooltipProps.offset,
    placement: tourStep.placement ?? tooltipProps.placement,
    shift: tourStep.shift ?? tooltipProps.shift,
  }), [tooltipProps, tourStep.arrow, tourStep.flip, tourStep.offset, tourStep.placement, tourStep.shift]);

  const floatingOptions = useMemo(() => {
    return makeFloatingOptions(arrowRef, floating);
  }, [floating]);

  const { floatingStyles, middlewareData, placement, refs } = useFloating(floatingOptions);

  const tooltipOpacity = useRef(new Animated.Value(0));

  const shapeOptions = useMemo((): Required<ShapeOptions> => {
    const options = tourStep.shape ?? shape;
    const padding = 16;

    return typeof options !== "string"
      ? { padding, type: "circle", ...options }
      : { padding, type: options };
  }, [tourStep, shape]);

  const useNativeDriver = useMemo(() => {
    const driverConfig: OSConfig<boolean> = typeof nativeDriver === "boolean"
      ? { android: nativeDriver, ios: nativeDriver, web: nativeDriver }
      : nativeDriver;

    return Platform.select({
      android: driverConfig.android,
      default: false,
      ios: driverConfig.ios,
      web: false,
    });
  }, [nativeDriver]);

  const handleBackdropPress = useCallback((): void => {
    const handler = tourStep.onBackdropPress ?? onBackdropPress;

    if (handler !== undefined && current !== undefined) {
      switch (handler) {
        case "continue":
          return next();

        case "stop":
          return stop();

        default:
          return handler({ current, goTo, next, pause, previous, resume, start, status: "running", stop });
      }
    }
  }, [tourStep, onBackdropPress, current, goTo, next, previous, start, stop, pause, resume]);


  // Animation de fade de la tooltip (show)
  useEffect(() => {
    const { height, width } = spot;

    if ([height, width].every(value => value > 0)) {
      Animated.timing(tooltipOpacity.current, {
        delay: 400,
        duration: 400,
        toValue: 1,
        useNativeDriver,
      })
        .start();
    }
  }, [spot, useNativeDriver]);

  // Animation de fade de la tooltip (hide)
  useImperativeHandle<TourOverlayRef, TourOverlayRef>(ref, () => ({
    hideTooltip: () => {
      return new Promise(resolve => {
        if (current !== undefined) {
          Animated.timing(tooltipOpacity.current, {
            duration: 400,
            toValue: 0,
            useNativeDriver,
          })
            .start(resolve);
        } else {
          resolve({ finished: true });
        }
      });
    },
  }), [current, useNativeDriver]);

  // Reférence de placement pour la tooltip
  useEffect(() => {
    const padding = shapeOptions.padding;
    refs.setReference({
      getBoundingClientRect: () => ({
        x: spot.x - padding / 2,
        y: spot.y - padding / 2,
        width: spot.width + padding,
        height: spot.height + padding,
      }),
    });
  }, [spot, shapeOptions.padding]);

  const x = useSharedValue(spot.x);
  const y = useSharedValue(spot.y);
  const w = useSharedValue(spot.width);
  const h = useSharedValue(spot.height);

  // Placement et formes (rectangle ou cercle)
  const spotPath = useDerivedValue(() => {
    const p = Skia.Path.Make();

    const padding = shapeOptions.padding;

    const left = x.value - padding / 2;
    const top = y.value - padding / 2;
    const width = w.value + padding;
    const height = h.value + padding;

    if (shapeOptions.type === "circle") {
      const cx = left + width / 2;
      const cy = top + height / 2;
      const r = Math.max(width, height) / 2;

      p.addCircle(cx, cy, r);
    } else {
      p.addRRect({
        rect: { x: left, y: top, width, height },
        rx: 4,
        ry: 4,
      });
    }

    return p;
  });

  // Animations (slide) // -> ajouter bounce et fade ?
  useEffect(() => {
    x.value = withTiming(spot.x, {
      duration: 400,
      easing: Easing.inOut(Easing.cubic),
    });

    y.value = withTiming(spot.y, {
      duration: 400,
      easing: Easing.inOut(Easing.cubic),
    });

    w.value = withTiming(spot.width, {
      duration: 400,
      easing: Easing.inOut(Easing.cubic),
    });

    h.value = withTiming(spot.height, {
      duration: 400,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [spot, motion]);

  return (
    <Modal
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      visible={current !== undefined}
    >
      <View style={Css.overlayView}>

        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={handleBackdropPress}
        />

        <Canvas style={{ width: vw(100), height: vh(100) }}>
          <Group layer>
            <Rect
              x={0}
              y={0}
              width={vw(100)}
              height={vh(100)}
              color={color}
              opacity={backdropOpacity}
            />

            <Group blendMode="clear">
              <Path path={spotPath} />
            </Group>
          </Group>
        </Canvas>

        {current !== undefined && (
          <Animated.View
            ref={refs.setFloating}
            style={{ ...floatingStyles, opacity: tooltipOpacity.current }}
          >
            <tourStep.render
              current={current}
              isFirst={current === 0}
              isLast={current === steps.length - 1}
              next={next}
              previous={previous}
              stop={stop}
              pause={pause}
              resume={resume}
              goTo={goTo}
            />

            {floating.arrow !== false && (
              <View
                style={[
                  Css.tooltipArrow,
                  arrowCss({
                    arrow:
                      typeof floating.arrow !== "boolean"
                        ? floating.arrow
                        : undefined,
                    data: middlewareData.arrow,
                    placement,
                  }),
                ]}
                ref={arrowRef}
              />
            )}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
});

function makeFloatingOptions(arrowRef: RefObject<null | View>, props: Optional<TooltipProps>): UseFloatingOptions {
  const arrowOption = typeof props?.arrow === "boolean"
    ? DEFAULT_ARROW
    : props?.arrow;
  const { size } = typeof arrowOption === "number"
    ? { ...DEFAULT_ARROW, size: arrowOption }
    : { ...DEFAULT_ARROW, ...arrowOption };
  const baseOffset = props?.offset || 4;
  const offsetValue = props?.arrow !== false
    ? (Math.sqrt(2 * size ** 2) / 2) + baseOffset
    : baseOffset;
  const arrowMw = props?.arrow !== false
    ? arrow({ element: arrowRef })
    : undefined;
  const flipMw = flipMiddleware(props?.flip);
  const offsetMw = props?.offset !== 0
    ? offset(offsetValue)
    : undefined;
  const shiftMw = shiftMiddleware(props?.shift);

  return {
    middleware: [flipMw, offsetMw, shiftMw, arrowMw].filter(Boolean),
    placement: props?.placement,
  };
}

function flipMiddleware(flipProps: Optional<boolean | FlipOptions>): Optional<Middleware> {
  if (flipProps !== false) {
    return flip(flipProps === true ? undefined : flipProps);
  }

  return undefined;
}

function shiftMiddleware(shiftProps: Optional<boolean | ShiftOptions>): Optional<Middleware> {
  if (shiftProps !== false) {
    return shift(shiftProps === true ? undefined : shiftProps);
  }

  return undefined;
}
