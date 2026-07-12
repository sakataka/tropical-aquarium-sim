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

export function FishGuideView({ speciesList, tank, viewportWidthPx }: FishGuideViewProps) {
  return (
    <section className="guide-view">
      <div className="guide-header">
        <div>
          <p>Field Guide</p>
          <h2>魚図鑑</h2>
        </div>
        <p>
          {tank.widthCm}cm水槽で観察できる姿と、実際の魚種の特徴
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
          const guide = fishGuide[species.id];
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
                  <div>
                    <h3>{species.displayName}</h3>
                    <p>{guide.scientificName}</p>
                  </div>
                  <span className="specimen-code">{species.id}</span>
                </div>
                <div className="guide-tags" aria-label={`${species.displayName}の基本情報`}>
                  <span>原産: {guide.origin}</span>
                  <span>体長: {species.realBodyLengthCm}cm</span>
                  <span>巡航: {species.cruisingSpeedCmPerSec}cm/s</span>
                </div>
                <dl className="guide-facts">
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
                  <span>表示体長 {Math.round(targetBodyLengthPx)}px</span>
                  <span>瞬発 {species.burstSpeedCmPerSec}cm/s</span>
                  <span>描画倍率 {scale.toFixed(4)}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
