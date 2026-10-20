import { TICKS_PER_QUARTER, type PartMeasure, type Pitch, type Score, type ScoreEvent } from "./model/score.ts";

/**
 * Piano score used across tests. Measure 1 (G major, 4/4, quarter=90):
 *   RH  D5 | E5 | chord E5+G5 (half, E5 tied to the next measure)
 *   LH  G3+D4 whole chord
 * Measure 2: RH an eighth-note triplet (E5 D5 C#5, the E5 receiving the tie), then a C natural and rests; LH whole-measure rest.
 */
export const PIANO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Test Piece</work-title></work>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
      <midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>1</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <direction placement="above">
        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type>
        <sound tempo="90"/>
      </direction>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice><type>half</type><staff>1</staff><notations><tied type="start"/></notations></note>
      <backup><duration>8</duration></backup>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>8</duration><voice>5</voice><type>whole</type><staff>2</staff></note>
      <note><chord/><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><voice>5</voice><type>whole</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <attributes><divisions>6</divisions></attributes>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><tie type="stop"/><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><staff>1</staff><notations><tied type="stop"/><tuplet type="start"/></notations></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><staff>1</staff></note>
      <note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><staff>1</staff><notations><tuplet type="stop"/></notations></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>12</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><rest/><duration>6</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>24</duration></backup>
      <note><rest measure="yes"/><duration>24</duration><voice>5</voice><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>
`;

/** "Twinkle Twinkle Little Star": 12 measures of 4/4 in C major, one melody staff. Plain enough for OMR to read reliably. */
export function twinkleScore(): Score {
  const q = TICKS_PER_QUARTER;
  const phrase = (notes: [string, 1 | 2][]) => notes;
  const phrases = [
    phrase([["C4", 1], ["C4", 1], ["G4", 1], ["G4", 1], ["A4", 1], ["A4", 1], ["G4", 2]]),
    phrase([["F4", 1], ["F4", 1], ["E4", 1], ["E4", 1], ["D4", 1], ["D4", 1], ["C4", 2]]),
    phrase([["G4", 1], ["G4", 1], ["F4", 1], ["F4", 1], ["E4", 1], ["E4", 1], ["D4", 2]]),
    phrase([["G4", 1], ["G4", 1], ["F4", 1], ["F4", 1], ["E4", 1], ["E4", 1], ["D4", 2]]),
    phrase([["C4", 1], ["C4", 1], ["G4", 1], ["G4", 1], ["A4", 1], ["A4", 1], ["G4", 2]]),
    phrase([["F4", 1], ["F4", 1], ["E4", 1], ["E4", 1], ["D4", 1], ["D4", 1], ["C4", 2]]),
  ];
  const measures: PartMeasure[] = Array.from({ length: 12 }, () => ({ voices: [{ id: 1, staff: 1, events: [] as ScoreEvent[] }] }));
  phrases.forEach((notes, pi) => {
    let m = pi * 2;
    let filled = 0;
    for (const [name, beats] of notes) {
      if (filled + beats > 4) {
        m++;
        filled = 0;
      }
      measures[m].voices[0].events.push({
        kind: "chord",
        ticks: beats * q,
        duration: { type: beats === 1 ? "quarter" : "half", dots: 0 },
        notes: [{ pitch: { step: name[0] as Pitch["step"], alter: 0, octave: Number(name[1]) } }],
      });
      filled += beats;
    }
  });
  return {
    title: "Twinkle Twinkle Little Star",
    composer: "Traditional",
    timeline: measures.map((_, i) => (i === 0 ? { time: { beats: 4, beatType: 4 }, key: { fifths: 0, mode: "major" as const }, tempo: 100 } : {})),
    parts: [{ id: "P1", name: "Melody", midiProgram: 0, staves: 1, measures }],
  };
}

/**
 * 3 measures of 4/4, one staff, divisions 1. Carries every notation symbol the model supports:
 *   m1  repeat start; mf; C5 staccato + slur start + lyric "Hel"; D5 slur stop + lyric "lo"; E5 half, accent + fermata
 *   m2  f; G4 whole with tenuto; first ending "1." closed by a repeat
 *   m3  second ending "2."; C5 whole; final barline
 */
export const SYMBOLS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction placement="below"><direction-type><dynamics><mf/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><notations><slur type="start" number="1"/><articulations><staccato/></articulations></notations><lyric number="1"><syllabic>begin</syllabic><text>Hel</text></lyric></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><notations><slur type="stop" number="1"/></notations><lyric number="1"><syllabic>end</syllabic><text>lo</text></lyric></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><notations><articulations><accent/></articulations><fermata/></notations></note>
    </measure>
    <measure number="2">
      <barline location="left"><ending number="1" type="start"/></barline>
      <direction placement="below"><direction-type><dynamics><f/></dynamics></direction-type></direction>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><notations><articulations><tenuto/></articulations></notations></note>
      <barline location="right"><bar-style>light-heavy</bar-style><ending number="1" type="stop"/><repeat direction="backward"/></barline>
    </measure>
    <measure number="3">
      <barline location="left"><ending number="2" type="start"/></barline>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
      <barline location="right"><bar-style>light-heavy</bar-style><ending number="2" type="discontinue"/></barline>
    </measure>
  </part>
</score-partwise>
`;
