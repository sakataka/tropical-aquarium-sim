import {
  getBaseSpriteScale,
  getTargetBodyLengthPx,
  fishGuideSchema,
  type FishSpeciesDefinition,
  type FishGuideEntry,
  type TankDefinition,
} from "../core";
import fishGuideJson from "../content/fish/guides.json";
import { getFishImageUrl } from "../render/assets";

type FishGuideViewProps = {
  speciesList: FishSpeciesDefinition[];
  tank: TankDefinition;
  viewportWidthPx: number;
};

const fishGuide: Record<string, FishGuideEntry> = fishGuideSchema.parse(fishGuideJson);

const fallbackGuide: FishGuideEntry = {
  scientificName: "未設定",
  origin: "魚種データ追加時に原産地を設定してください。",
  temperament: "魚種データ追加時に性格を設定してください。",
  movement: "魚種データ追加時に実際の動きとシミュレーション上の動きを設定してください。",
  habitat: "魚種データ追加時に水槽での見え方を設定してください。",
  note: "この魚種の図鑑説明は未設定です。",
};

export function FishGuideView({ speciesList, tank, viewportWidthPx }: FishGuideViewProps) {
  return (
    <section className="guide-view">
      <div className="guide-header">
        <h2>魚図鑑</h2>
        <p>
          {tank.widthCm}cm水槽での表示サイズと、実際の魚種の特徴
        </p>
      </div>
      <div className="guide-list">
        {speciesList.map((species) => {
          const targetBodyLengthPx = getTargetBodyLengthPx({
            viewportWidthPx,
            tankWidthCm: tank.widthCm,
            realBodyLengthCm: species.realBodyLengthCm,
          });
          const scale = getBaseSpriteScale({
            viewportWidthPx,
            tankWidthCm: tank.widthCm,
            species,
          });
          const guide = fishGuide[species.id] ?? fallbackGuide;
          return (
            <article className="guide-card" key={species.id}>
              <div className="guide-fish-preview">
                <img
                  alt={species.displayName}
                  src={getFishImageUrl(species.id)}
                  style={{ width: `${targetBodyLengthPx}px` }}
                />
              </div>
              <div className="guide-copy">
                <div className="guide-title">
                  <h3>{species.displayName}</h3>
                  <p>{guide.scientificName}</p>
                </div>
                <dl className="guide-facts">
                  <div>
                    <dt>原産</dt>
                    <dd>{guide.origin}</dd>
                  </div>
                  <div>
                    <dt>性格</dt>
                    <dd>{guide.temperament}</dd>
                  </div>
                  <div>
                    <dt>動き</dt>
                    <dd>{guide.movement}</dd>
                  </div>
                  <div>
                    <dt>水槽での見え方</dt>
                    <dd>{guide.habitat}</dd>
                  </div>
                </dl>
                <p className="guide-note">{guide.note}</p>
                <div className="guide-metrics" aria-label={`${species.displayName}の表示設定`}>
                  <span>実寸 {species.realBodyLengthCm}cm</span>
                  <span>表示体長 {Math.round(targetBodyLengthPx)}px</span>
                  <span>巡航 {species.cruisingSpeedCmPerSec}cm/s</span>
                  <span>瞬発 {species.burstSpeedCmPerSec}cm/s</span>
                  <span>scale {scale.toFixed(4)}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
