import { describe, expect, it } from 'vitest';
import { DEFAULT_HALF_ANGLE, compassWord, describeDirection, parseDirection } from '../src/lib/direction';

const centers = (raw: string) => parseDirection(raw).map((c) => c.center);

describe('parseDirection', () => {
  it('reads plain and negative degrees', () => {
    expect(parseDirection('135')).toEqual([{ center: 135, half: DEFAULT_HALF_ANGLE }]);
    expect(centers('-30')).toEqual([330]);
    expect(centers('360')).toEqual([0]);
    expect(centers('12.5')).toEqual([12.5]);
  });

  it('reads several directions, separated by semicolons or commas, without duplicates', () => {
    expect(centers('90;270')).toEqual([90, 270]);
    expect(centers('70, 210, 300')).toEqual([70, 210, 300]);
    expect(centers('0;0;0')).toEqual([0]);
    expect(centers('0;')).toEqual([0]);
  });

  it('reads a clockwise field-of-view range, including one that wraps past north', () => {
    expect(parseDirection('45-135')).toEqual([{ center: 90, half: 45 }]);
    expect(parseDirection('338-23')).toEqual([{ center: 0.5, half: DEFAULT_HALF_ANGLE }]);
    expect(centers('338-23;155-200')).toEqual([0.5, 177.5]);
    expect(parseDirection('180-180')).toEqual([{ center: 180, half: DEFAULT_HALF_ANGLE }]);
    expect(parseDirection('0-360')).toEqual([{ center: 0, half: 180 }]);
  });

  it('reads compass points and words in any case', () => {
    expect(centers('NE')).toEqual([45]);
    expect(centers('nw')).toEqual([315]);
    expect(centers('WSW')).toEqual([247.5]);
    expect(centers('north')).toEqual([0]);
    expect(centers('South')).toEqual([180]);
    expect(centers('north-east')).toEqual([45]);
  });

  it('drops what it cannot read instead of guessing', () => {
    for (const junk of ['forward', 'backward', 'both', 'disabled!', 'EB', 'xx', 'Down', '150000099', '400-20', '']) {
      expect(parseDirection(junk), junk).toEqual([]);
    }
    expect(parseDirection(undefined)).toEqual([]);
    expect(centers('forward;90')).toEqual([90]);
  });
});

describe('describing directions', () => {
  it('names the nearest compass point', () => {
    expect(compassWord(0)).toBe('north');
    expect(compassWord(44)).toBe('northeast');
    expect(compassWord(350)).toBe('north');
    expect(compassWord(200)).toBe('south');
  });

  it('writes a short phrase for the camera card', () => {
    expect(describeDirection(parseDirection('135'))).toBe('Faces southeast (135°)');
    expect(describeDirection(parseDirection('90;270'))).toBe('Faces east and west');
    expect(describeDirection(parseDirection('350;10'))).toBe('Faces north');
    expect(describeDirection(parseDirection('0-360'))).toBe('Sees in every direction');
    expect(describeDirection(parseDirection('0;65;130;195;260;325'))).toBe('Points 6 ways, covering most directions');
    expect(describeDirection([])).toBe('Direction not recorded');
  });
});
