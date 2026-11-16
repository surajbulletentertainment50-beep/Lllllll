import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet, Easing } from 'react-native';

export interface MarqueeSongTitleProps {
  text: string;
  style?: any;
  textStyle?: any;
}

export const MarqueeSongTitle: React.FC<MarqueeSongTitleProps> = ({
  text,
  style,
  textStyle,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const [textWidth, setTextWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(200);

  useEffect(() => {
    if (textWidth <= containerWidth || textWidth === 0) {
      translateX.setValue(0);
      return;
    }

    const distance = textWidth + 40;
    const duration = distance * 40; // smooth Instagram-style scroll speed

    translateX.setValue(containerWidth);
    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: -textWidth - 20,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();

    return () => {
      anim.stop();
    };
  }, [textWidth, containerWidth, text, translateX]);

  return (
    <View
      style={[styles.container, style]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.scrollingWrap}>
        {textWidth > containerWidth ? (
          <Animated.Text
            style={[
              styles.text,
              textStyle,
              {
                transform: [{ translateX }],
                position: 'absolute',
                left: 0,
                width: 1200,
              },
            ]}
            numberOfLines={1}
          >
            {text}         {text}
          </Animated.Text>
        ) : (
          <Text
            style={[styles.text, textStyle]}
            numberOfLines={1}
            onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)}
          >
            {text}
          </Text>
        )}
      </View>
      {/* Invisible measurer */}
      <Text
        style={[styles.text, textStyle, styles.measurer]}
        numberOfLines={1}
        onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)}
      >
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    height: 22,
    justifyContent: 'center',
    width: '75%',
  },
  scrollingWrap: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  text: {
    color: 'white',
    fontSize: 13,
  },
  measurer: {
    position: 'absolute',
    opacity: 0,
    zIndex: -99,
    left: -9999,
  },
});

export default MarqueeSongTitle;
