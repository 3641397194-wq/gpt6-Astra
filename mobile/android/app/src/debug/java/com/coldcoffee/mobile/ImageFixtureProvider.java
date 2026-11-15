/*
 * Copyright (C) 2026 ColdCoffee contributors.
 * SPDX-License-Identifier: GPL-3.0-only
 */
package com.coldcoffee.mobile;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;

/** Non-exported debug fixture; absent from release APKs. Uses no user images. */
public final class ImageFixtureProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }

    private synchronized File fixture(Uri uri) throws FileNotFoundException {
        if (!"/sample.png".equals(uri.getPath())) throw new FileNotFoundException("Unknown fixture");
        File image = new File(getContext().getCacheDir(), "native-image-fixture.png");
        if (!image.isFile()) {
            Bitmap bitmap = Bitmap.createBitmap(2, 3, Bitmap.Config.ARGB_8888);
            bitmap.eraseColor(Color.rgb(217, 71, 88));
            try (FileOutputStream output = new FileOutputStream(image)) {
                if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) {
                    throw new FileNotFoundException("Fixture image encoding failed");
                }
            } catch (Exception error) {
                throw new FileNotFoundException("Fixture image creation failed");
            } finally {
                bitmap.recycle();
            }
        }
        return image;
    }

    @Override public String getType(Uri uri) { return "image/png"; }

    @Override public Cursor query(Uri uri, String[] projection, String selection,
                                  String[] selectionArgs, String sortOrder) {
        try {
            File image = fixture(uri);
            MatrixCursor result = new MatrixCursor(
                    new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
            result.addRow(new Object[]{"native-image-fixture.png", image.length()});
            return result;
        } catch (FileNotFoundException error) {
            return new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        }
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Read-only fixture");
        return ParcelFileDescriptor.open(fixture(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("Read-only fixture");
    }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Read-only fixture");
    }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Read-only fixture");
    }
}
