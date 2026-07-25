# Evidence layer classes are (de)serialized via kotlinx.serialization and
# reflected upon by Room; keep their shapes intact under R8 full mode.
-keep,includedescriptorclasses class com.pramana.evidence.envelope.**$$serializer { *; }
-keepclassmembers class com.pramana.evidence.envelope.** {
    *** Companion;
}
-keepclasseswithmembers class com.pramana.evidence.envelope.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep class com.pramana.evidence.data.** { *; }
