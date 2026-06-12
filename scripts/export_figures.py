"""Export paper PDF figures to PNG for the project website."""

from pathlib import Path

import fitz

SRC_DIR = Path(__file__).resolve().parents[1] / "_CoRL26__Flow_Reversal_Steering" / "figures"
OUT_DIR = Path(__file__).resolve().parents[1] / "static" / "images" / "figures"

FIGURES = [
    "Teaser.pdf",
    "FlowVsForwardDiffusion.pdf",
    "LiberoZeroShotResults.pdf",
    "LiberoBCResults.pdf",
    "LiberoRLResults.pdf",
    "DroidExamples.pdf",
    "DroidResults.pdf",
    "LogProbScatter_multistep.pdf",
    "DistanceMoved_byN.pdf",
    "LogProbRatio_byN.pdf",
]


def export_figure(pdf_path: Path, png_path: Path, zoom: float = 2.0) -> None:
    doc = fitz.open(pdf_path)
    page = doc[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    png_path.parent.mkdir(parents=True, exist_ok=True)
    pix.save(png_path)
    doc.close()
    print(f"Wrote {png_path.name} ({pix.width}x{pix.height})")


def main() -> None:
    for name in FIGURES:
        export_figure(SRC_DIR / name, OUT_DIR / name.replace(".pdf", ".png"))


if __name__ == "__main__":
    main()
