import { Fragment } from "react";
import { annotate, type WordSource } from "../../lib/derja";

/** A derja word as it is drawn everywhere: isolated, right to left, never styled by the text around it. */
export function DerjaWord({ word }: { word: string }) {
  return (
    <bdi dir="rtl" lang="aeb" className="arabic derja">
      {word}
    </bdi>
  );
}

/** One text of a diagnosis with the derja word after each key term (Phase 16). */
export function DerjaText({ text, sources }: { text: string; sources: WordSource[] }) {
  if (sources.length === 0) return <>{text}</>;
  return (
    <>
      {annotate(text, sources).map((piece, i) => {
        if (piece.kind === "text") return <Fragment key={i}>{piece.text}</Fragment>;
        const word = <DerjaWord word={piece.word} />;
        if (piece.place === "lead") return <Fragment key={i}>{word} · </Fragment>;
        if (piece.place === "trail") return <Fragment key={i}> · {word}</Fragment>;
        return <Fragment key={i}> ({word})</Fragment>;
      })}
    </>
  );
}
