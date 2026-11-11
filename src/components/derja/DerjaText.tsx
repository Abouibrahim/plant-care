import { Fragment, useContext, useMemo } from "react";
import { annotate, type WordSource } from "../../lib/derja";
import { DerjaSources } from "./sources";

/** A derja word as it is drawn everywhere: isolated, right to left, never styled by the text around it. */
export function DerjaWord({ word }: { word: string }) {
  return (
    <bdi dir="rtl" lang="aeb" className="arabic derja">
      {word}
    </bdi>
  );
}

/**
 * One text with the derja word after each key term (Phase 16). The words come from the `sources`
 * prop (a diagnosis) or, without it, from the page's DerjaSources (a profile, Phase 17).
 */
export function DerjaText({ text, sources }: { text: string; sources?: WordSource[] }) {
  const fromPage = useContext(DerjaSources);
  const used = sources ?? fromPage;
  const pieces = useMemo(() => (used.length === 0 ? null : annotate(text, used)), [text, used]);
  if (!pieces) return <>{text}</>;
  return (
    <>
      {pieces.map((piece, i) => {
        if (piece.kind === "text") return <Fragment key={i}>{piece.text}</Fragment>;
        const word = <DerjaWord word={piece.word} />;
        if (piece.place === "lead") return <Fragment key={i}>{word} · </Fragment>;
        if (piece.place === "trail") return <Fragment key={i}> · {word}</Fragment>;
        return <Fragment key={i}> ({word})</Fragment>;
      })}
    </>
  );
}
