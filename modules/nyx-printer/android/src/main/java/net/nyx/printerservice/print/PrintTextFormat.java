package net.nyx.printerservice.print;

import android.os.Parcel;
import android.os.Parcelable;

/**
 * Format de texte du SDK imprimante NYX.
 *
 * Champs et ORDRE de parcel reproduits EXACTEMENT depuis la classe officielle
 * (décompilée de l'app NYX PosTest) — l'ordre writeToParcel doit correspondre à
 * ce que le service lit, sinon les données sont mal interprétées.
 *
 *   align : 0 = gauche, 1 = centre, 2 = droite
 *   style : 0 = normal, 1 = gras
 *   textScaleX/Y : facteur d'agrandissement (2.0 = double taille pour un titre)
 */
public class PrintTextFormat implements Parcelable {
    public int textSize = 24;
    public boolean underline = false;
    public float textScaleX = 1.0f;
    public float textScaleY = 1.0f;
    public float letterSpacing = 0.0f;
    public float lineSpacing = 0.0f;
    public int topPadding = 0;
    public int leftPadding = 0;
    public int align = 0;
    public int style = 0;
    public int font = 0;
    public String path = null;

    public PrintTextFormat() {
    }

    protected PrintTextFormat(Parcel in) {
        textSize = in.readInt();
        underline = in.readByte() != 0;
        textScaleX = in.readFloat();
        textScaleY = in.readFloat();
        letterSpacing = in.readFloat();
        lineSpacing = in.readFloat();
        topPadding = in.readInt();
        leftPadding = in.readInt();
        align = in.readInt();
        style = in.readInt();
        font = in.readInt();
        path = in.readString();
    }

    @Override
    public int describeContents() {
        return 0;
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
        dest.writeInt(textSize);
        dest.writeByte((byte) (underline ? 1 : 0));
        dest.writeFloat(textScaleX);
        dest.writeFloat(textScaleY);
        dest.writeFloat(letterSpacing);
        dest.writeFloat(lineSpacing);
        dest.writeInt(topPadding);
        dest.writeInt(leftPadding);
        dest.writeInt(align);
        dest.writeInt(style);
        dest.writeInt(font);
        dest.writeString(path);
    }

    public static final Creator<PrintTextFormat> CREATOR = new Creator<PrintTextFormat>() {
        @Override
        public PrintTextFormat createFromParcel(Parcel in) {
            return new PrintTextFormat(in);
        }

        @Override
        public PrintTextFormat[] newArray(int size) {
            return new PrintTextFormat[size];
        }
    };
}
