/**
 * Tests for Metadata Enrichment
 */

// Mock Logger before requiring metadata-enrichment
jest.mock('../lib/logger', () => {
  return jest.fn().mockImplementation(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }));
});

describe('MetadataEnrichment', () => {
  let enrichment;

  beforeEach(() => {
    jest.resetModules();
    enrichment = require('../lib/integration/metadata-enrichment');
  });

  describe('detectGenre', () => {
    test('detects electronic from keywords', () => {
      const genre = enrichment.detectGenre('a synth-based house track');
      expect(['electronic', 'house']).toContain(genre);
    });

    test('detects lofi from keywords', () => {
      const genre = enrichment.detectGenre('a chill lofi beat');
      expect(genre).toBe('lofi');
    });

    test('detects hiphop from keywords', () => {
      const genre = enrichment.detectGenre('hip hop trap beats');
      expect(['hiphop', 'trap']).toContain(genre);
    });

    test('returns uncategorized if no keywords match', () => {
      const genre = enrichment.detectGenre('some random text');
      expect(genre).toBe('uncategorized');
    });

    test('handles empty prompt', () => {
      const genre = enrichment.detectGenre('');
      expect(genre).toBe('uncategorized');
    });
  });

  describe('detectMood', () => {
    test('detects happy mood', () => {
      const mood = enrichment.detectMood('a cheerful upbeat song');
      expect(mood).toBe('happy');
    });

    test('detects calm mood', () => {
      const mood = enrichment.detectMood('peaceful and relaxing');
      expect(mood).toBe('calm');
    });

    test('detects energetic mood', () => {
      const mood = enrichment.detectMood('intense and powerful');
      expect(mood).toBe('energetic');
    });

    test('returns neutral if no mood keywords', () => {
      const mood = enrichment.detectMood('a song');
      expect(mood).toBe('neutral');
    });
  });

  describe('estimateEnergyLevel', () => {
    test('estimates high energy from keywords', () => {
      const energy = enrichment.estimateEnergyLevel('intense energetic explosive');
      expect(energy).toBeGreaterThan(6);
    });

    test('estimates low energy from keywords', () => {
      const energy = enrichment.estimateEnergyLevel('calm relaxing peaceful');
      expect(energy).toBeLessThan(5);
    });

    test('returns default for neutral prompt', () => {
      const energy = enrichment.estimateEnergyLevel('a song');
      expect(energy).toBe(5);
    });

    test('keeps energy within 1-10 range', () => {
      const energy1 = enrichment.estimateEnergyLevel('calm calm calm calm calm');
      const energy2 = enrichment.estimateEnergyLevel('intense intense intense intense');

      expect(energy1).toBeGreaterThanOrEqual(1);
      expect(energy1).toBeLessThanOrEqual(10);
      expect(energy2).toBeGreaterThanOrEqual(1);
      expect(energy2).toBeLessThanOrEqual(10);
    });
  });

  describe('estimateBPM', () => {
    test('returns 60 for slow ballad', () => {
      const bpm = enrichment.estimateBPM('slow ballad');
      expect(bpm).toBe(60);
    });

    test('returns 128 for house music', () => {
      const bpm = enrichment.estimateBPM('house electronic');
      expect(bpm).toBe(128);
    });

    test('returns 85 for lofi', () => {
      const bpm = enrichment.estimateBPM('lofi chill beat');
      expect(bpm).toBe(85);
    });

    test('returns default 120 for unknown', () => {
      const bpm = enrichment.estimateBPM('a song');
      expect(bpm).toBe(120);
    });
  });

  describe('getAudioFormatName', () => {
    test('returns format name for known codes', () => {
      expect(enrichment.getAudioFormatName(1)).toBe('PCM');
      expect(enrichment.getAudioFormatName(2)).toBe('ADPCM');
    });

    test('returns Unknown for unknown codes', () => {
      const name = enrichment.getAudioFormatName(999);
      expect(name).toContain('Unknown');
    });
  });

  describe('enrichMetadata', () => {
    test('enriches metadata with detected characteristics', () => {
      const metadata = { prompt: 'peaceful relaxing lofi beat' };
      const enriched = enrichment.enrichMetadata(metadata);

      expect(enriched.genre).toBe('lofi');
      expect(enriched.mood).toBe('calm');
      expect(enriched.energyLevel).toBeLessThan(5);
      expect(enriched.bpm).toBe(85);
      expect(enriched.enrichedAt).toBeDefined();
    });

    test('preserves existing metadata values', () => {
      const metadata = {
        prompt: 'some prompt',
        genre: 'custom',
        mood: 'custom_mood',
      };
      const enriched = enrichment.enrichMetadata(metadata);

      expect(enriched.genre).toBe('custom');
      expect(enriched.mood).toBe('custom_mood');
    });
  });
});
