import {
  getBaseSpriteScale,
  getTargetBodyLengthPx,
  type FishSpeciesDefinition,
  type TankDefinition,
} from "../core";
import { getFishImageUrl } from "../render/assets";

type FishGuideViewProps = {
  speciesList: FishSpeciesDefinition[];
  tank: TankDefinition;
  viewportWidthPx: number;
};

type FishGuideEntry = {
  scientificName: string;
  origin: string;
  temperament: string;
  movement: string;
  habitat: string;
  note: string;
};

const fishGuide: Record<string, FishGuideEntry> = {
  "neon-tetra": {
    scientificName: "Paracheirodon innesi",
    origin: "南米アマゾン上流域。ペルー周辺の小川や浸水林、水草や落ち葉の多い暗めの水域に由来します。",
    temperament: "非常に温和な群泳魚です。単独では落ち着きにくく、同種が多いほど自然なまとまりと発色が出ます。",
    movement: "中層を小刻みに進み、短い加速と停止を繰り返します。群れの中心へ戻る力が強く、驚くと素早く距離を取ります。",
    habitat: "水草、流木、やや暗い背景と相性が良い魚です。明るすぎる水槽より、陰影がある環境で青赤のラインが目立ちます。",
    note: "このシミュレーションでは群泳、速い巡航、タップへの敏感な逃避反応を強めに設定しています。",
  },
  "harlequin-rasbora": {
    scientificName: "Trigonostigma heteromorpha",
    origin: "東南アジア。マレー半島南部、タイ南部、スマトラ周辺の緩やかな流れや湿地性の水域に分布します。",
    temperament: "温和で協調性が高い魚です。ネオンテトラより少し落ち着いた群れを作り、混泳水槽でも前に出やすい性格です。",
    movement: "中層を滑るように泳ぎ、群れの間隔を保ちながら方向を合わせます。急な刺激にはまとまって逃げます。",
    habitat: "水草が多く、流れが強すぎない水槽で見栄えします。体側の黒い三角斑が背景の緑に映えます。",
    note: "このシミュレーションでは群れの整列と追従を強め、ネオンテトラより少し大きい弧で泳ぐようにしています。",
  },
  guppy: {
    scientificName: "Poecilia reticulata",
    origin: "南米北部からカリブ海周辺。トリニダード、ベネズエラ、バルバドスなどの小川や浅い水域に由来します。",
    temperament: "温和で好奇心が強く、餌への反応も速い魚です。繁殖力が高く、改良品種では色や尾びれの差が大きく出ます。",
    movement: "表層から中層を活発に泳ぎ、尾びれを振りながら細かく向きを変えます。群れますが、密な隊列より散らばった動きが目立ちます。",
    habitat: "明るめの水槽や水草のある開けた空間でよく映えます。水面近くに出ることが多く、餌やり時の動きが派手です。",
    note: "このシミュレーションでは表層寄り、餌への高い反応、タップ時の素早い逃避を設定しています。",
  },
  corydoras: {
    scientificName: "Corydoras sp.",
    origin: "南米の河川や支流に広く見られる小型ナマズの仲間です。砂底、落ち葉、流木の周辺で底を探る生活をします。",
    temperament: "非常に温和な底ものです。同種や近い仲間と一緒にいると落ち着き、他魚を追い回すことはほとんどありません。",
    movement: "底面を短く進んでは止まり、口ひげで砂や石の周辺を探ります。時々水面へ空気を吸いに上がる行動もあります。",
    habitat: "角のない砂底、流木、石陰、水草の根元が似合います。派手さより、底で生活感を作る役割が強い魚です。",
    note: "このシミュレーションでは底層維持、構造物寄り、ゆっくりした停止時間を長めに設定しています。",
  },
  "dwarf-gourami": {
    scientificName: "Trichogaster lalius",
    origin: "南アジア。インド、バングラデシュ、ネパール周辺の水草が密な池、湿地、水田、緩やかな水域に由来します。",
    temperament: "基本は穏やかですが、成熟した雄は縄張り意識を見せることがあります。周囲を観察するような慎重さもあります。",
    movement: "上層から中層をゆっくり巡回し、長い腹びれで周囲を探るように動きます。気になる場所へ近づく反応も出ます。",
    habitat: "浮草や背の高い水草、弱い水流と相性が良い魚です。空気呼吸できるラビリンス器官を持つため、水面への導線も重要です。",
    note: "このシミュレーションでは表層寄り、構造物の巡回、タップへの様子見反応を持たせています。",
  },
  angelfish: {
    scientificName: "Pterophyllum scalare",
    origin: "南米アマゾン水系。ペルー、コロンビア、ブラジル周辺の流れの穏やかな支流や水草・流木の多い水域に由来します。",
    temperament: "幼魚は比較的穏やかですが、成長すると存在感が強くなり、ペア形成や産卵期には縄張りを主張します。",
    movement: "高い体と長いひれを保ちながら、中層をゆっくり滑るように泳ぎます。急旋回より、余裕のある方向転換が特徴です。",
    habitat: "背の高い水槽、縦に伸びる水草、流木の陰がよく合います。小さすぎる魚は捕食対象になり得ます。",
    note: "このシミュレーションでは低速巡航、長めの停止、構造物寄り、タップ時の警戒停止を設定しています。",
  },
};

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
