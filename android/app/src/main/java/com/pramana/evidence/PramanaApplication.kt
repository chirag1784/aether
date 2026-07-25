package com.pramana.evidence

import android.app.Application
import com.pramana.evidence.data.AppDatabase

class PramanaApplication : Application() {
    val database: AppDatabase by lazy { AppDatabase.get(this) }

    override fun onCreate() {
        super.onCreate()
    }
}
