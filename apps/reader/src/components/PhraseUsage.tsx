import type { PersonalMaterialTerm } from "../lib/personalLibrary";
import { Volume2 } from "lucide-react";
import "./PhraseUsage.css";

export function PhraseUsage({ card, onSpeak }: { card: PersonalMaterialTerm; onSpeak: (text:string) => void }) {
  return (
    <section className="fv-phrase-usage" aria-label="表达用法">
      <h3>平时怎么用</h3>
      <p>{card.usageTip}</p>
      {card.exampleEn && <div className="fv-phrase-transfer">
        <button type="button" aria-label="朗读日常例句" onClick={() => onSpeak(card.exampleEn!)}><Volume2 size={18} /></button>
        <p lang="en">{card.exampleEn}</p>
        {card.exampleZh && <p lang="zh-CN">{card.exampleZh}</p>}
      </div>}
    </section>
  );
}
