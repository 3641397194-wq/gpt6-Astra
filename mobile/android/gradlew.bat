@echo off
rem Copyright (C) 2026 ColdCoffee contributors.
rem SPDX-License-Identifier: GPL-3.0-only
setlocal
set "APP_DIR=%~dp0"
if defined JAVA_HOME (
  set "JAVA_COMMAND=%JAVA_HOME%\bin\java.exe"
) else (
  set "JAVA_COMMAND=java.exe"
)
"%JAVA_COMMAND%" -classpath "%APP_DIR%gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
exit /b %ERRORLEVEL%
