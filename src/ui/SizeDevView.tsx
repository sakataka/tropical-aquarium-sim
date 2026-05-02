import { getBaseSpriteScale, getTargetBodyLengthPx, type FishSpeciesDefinition, type TankDefinition } from "../core";
import { getFishImageUrl } from "../render/assets";

type SizeDevViewProps = {
  speciesList: FishSpeciesDefinition[];
  tank: TankDefinition;
  viewportWidthPx: number;
};

export function SizeDevView({ speciesList, tank, viewportWidthPx }: SizeDevViewProps) {
  return (
    <section className="dev-view">
      <div className="dev-header">
        <h2>サイズ確認</h2>
        <p>
          {tank.widthCm}cm水槽 / viewport {Math.round(viewportWidthPx)}px
        </p>
      </div>
      <div className="size-tank">
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
          return (
            <article className="size-row" key={species.id}>
              <img
                alt={species.displayName}
                src={getFishImageUrl(species.id)}
                style={{ width: `${targetBodyLengthPx}px` }}
              />
              <div>
                <h3>{species.displayName}</h3>
                <p>
                  実寸 {species.realBodyLengthCm}cm / body {Math.round(targetBodyLengthPx)}px
                </p>
                <p>
                  sourceBodyBounds.width {species.sourceBodyBounds.width}px / scale{" "}
                  {scale.toFixed(4)}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
