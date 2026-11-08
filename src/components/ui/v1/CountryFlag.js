// CountryFlag — the single, offline country-flag renderer for UrTruck.
// SVG artwork comes from `country-flag-icons` and is bundled with the app.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import * as ReactNativeSvg from 'react-native-svg';
import * as FLAG_XML from 'country-flag-icons/string/1x1';
import { countryCode } from '../../../utils/countryFlags';

const { SvgXml } = ReactNativeSvg;

// `country-flag-icons` is the bundled ISO source for every country. Its KZ
// artwork, however, omits the eagle and reduces the ornament to blocks. Keep
// the vendored square official artwork embedded as XML for the renderer. A
// local SVG asset URI works in browsers but resolves to an Android asset URI
// that SvgUri cannot load reliably in release APKs; SvgXml renders the same
// offline artwork on Android, iOS and web. The source SVG remains at
// src/assets/flags/kz.svg for auditability and visual-contract checks.
const KZ_FULL_FLAG_BASE64 = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiBpZD0iZmxhZy1pY29ucy1reiIgdmlld0JveD0iMCAwIDUxMiA1MTIiPgogIDxwYXRoIGZpbGw9IiMwMGFiYzIiIGQ9Ik0wIDBoNTEydjUxMkgweiIvPgogIDxnIGZpbGw9IiNmZmVjMmQiPgogICAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjc2LjcgMjE1KXNjYWxlKC41MTIpIj4KICAgICAgPGNpcmNsZSByPSIxMzQuNiIvPgogICAgICA8ZyBpZD0ia3otYyI+CiAgICAgICAgPGcgaWQ9Imt6LWIiPgogICAgICAgICAgPHBhdGggaWQ9Imt6LWEiIGQ9Ik0wLTE1Mi45YzgtLjEgMTEtNS4xIDExLTExLjEgMC04LTExLTQ2LjEtMTEtNDYuMVMtMTEtMTcyLTExLTE2NGMwIDYgMyAxMS4xIDExIDExLjEiLz4KICAgICAgICAgIDx1c2UgeGxpbms6aHJlZj0iI2t6LWEiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHRyYW5zZm9ybT0icm90YXRlKDkwKSIvPgogICAgICAgICAgPHVzZSB4bGluazpocmVmPSIja3otYSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgdHJhbnNmb3JtPSJzY2FsZSgtMSkiLz4KICAgICAgICAgIDx1c2UgeGxpbms6aHJlZj0iI2t6LWEiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHRyYW5zZm9ybT0icm90YXRlKC05MCkiLz4KICAgICAgICA8L2c+CiAgICAgICAgPHVzZSB4bGluazpocmVmPSIja3otYiIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgdHJhbnNmb3JtPSJyb3RhdGUoMjIuNSkiLz4KICAgICAgICA8dXNlIHhsaW5rOmhyZWY9IiNrei1iIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB0cmFuc2Zvcm09InJvdGF0ZSg0NSkiLz4KICAgICAgICA8dXNlIHhsaW5rOmhyZWY9IiNrei1iIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiB0cmFuc2Zvcm09InJvdGF0ZSg2Ny41KSIvPgogICAgICA8L2c+CiAgICAgIDx1c2UgeGxpbms6aHJlZj0iI2t6LWMiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHRyYW5zZm9ybT0icm90YXRlKDExLjMpIi8+CiAgICA8L2c+CiAgICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjc2LjUpc2NhbGUoLjUxMikiPgogICAgICA8cGF0aCBkPSJNMTA3NS44IDY1NWMtMy41IDYuMy01LjYgMTMuNi0xMCAxOS4zLTEzLjYtMTIuMy0zMy4yLTEyLTUwLjQtMTIuNy0xNC4yLS44LTI5LjYtMi4xLTQwLjYtMTIuMi0xMS41LTkuNS0yMS0yMS43LTMzLjgtMjkuNGE4MyA4MyAwIDAgMS0zMy4xLTE1LjNjLTIwLjItMTYuNS0zMS44LTQxLTUxLjYtNTgtMy43LTMuNi04LjItNi41LTEyLjQtOS42LTQgMS0yLjIgOS42LTcuMSA1LjItMi43LTItOS40LTIuMS0xMCAuNiA2IDggMTIuMSAxNyAxMyAyNy4yLTQuMi40LTExLjUtLjktMTMuNS42YTg0IDg0IDAgMCAwIDIwLjQgMjEuM2MtMy44LjYtMTEuMy4zLTEyLjggMS44YTU5IDU5IDAgMCAwIDI2LjggMTQuN2MyIDIuOC0zLjEgOC4yIDEuMyAxMC42IDIuNSAxIDEwLjkgMi44IDUuMSA1LjctNCAyLjYtMi41IDguOSAyLjYgOC43IDMuMiAxLjcgMTAuNCAyIDExIDUtMi45IDIuOC0xMS43IDYuMi00LjIgOWE1MiA1MiAwIDAgMCAyMy4xIDYuN2MtNCAzLjQtOSA1LjMtMTMuMSA4LjUgMTguNSAxMC45IDM5IDE4IDU5LjQgMjUgOCAyLjYgMTYuMyA1LjEgMjQuNyA2LjctMjQuNC0xLjQtNDgtOC42LTcwLjItMTguNXEtMTcuMi03LjYtMzQuOC0xNC4yYzUuMS0yLjcgMTEuMS0zLjQgMTYuNS01LjctMTEuMi0yLjItMjMuMy0zLTMzLTkgMS40LTIuOCA3LTIuOSAxMC4yLTQuMyA2LTEuNCA5LjYtMyAxLjMtMy42LTguNC0yLjMtMTgtMS4zLTI1LjUtNi4zLjUtMyA4LjMtMiAxMS40LTMuMyA0LS43IDguNC0xLjMgMTEuNi00LTEzLTUuMy0zMC0xLjUtNDAuMi0xMy0yLjMtNC40IDcuMy0uOSAxMC0xLjYgNyAwIDE0LjUgMi4yIDIxLjItLjYtMTktOC4zLTM5LjMtMTYtNTMuNy0zMS40LTEuNi0yLjUtNi40LTkuMy0yLjUtMTAuMSAxMS4yIDEuNSAxOS4zIDEzLjcgMzEuNCAxMS44IDEuNi0yLjEtNy01LjYtOS4yLTguN2EyMjkgMjI5IDAgMCAxLTQ2LjgtNTFjLS44LTYuNyA5LjUtNy43IDEyLjItMi42IDEzLjQgMTMgMjUuNSAyOCA0Mi4yIDM2LjggNiAyLjktMy40LTMuNC00LjYtNS43YTI5OSAyOTkgMCAwIDEtNDAuOS01Ny45Yy0yLTMuOC01LjEtMTAuNy43LTEyLjcgNS43LTIuOSAxMS41IDEgMTQuNCA2IDExLjMgMTQuMyAxOS43IDMxLjMgMzMuOCA0My4yLTEyLTIzLjMtMjQuOS00OC0yNS4yLTc0LjguMy01LjIuNi0xMyA3LjctMTIuOSA2LS45IDUgNi43IDcgMTAuMyA1LjggMTkuOCA4LjMgNDEuMiAyMCA1OC42LTIuNS0xNC42LTYuNC0yOS43LTMuOC00NC42LjYtNSA2LTYuNCA5LjctMy40IDIuOSA3IDMuNSAxNS45IDYuMSAyMy41YTIzNyAyMzcgMCAwIDAgOTMgMTI3LjIgMjQ1IDI0NSAwIDAgMCAxMjMuMyA0Mi4zcTYgLjUgMTEuOS43bTEzNi40IDkxLjFjLTcuMiA0LjQtMTIuOC0zLjQtMTguOC01LjctNC40IDIuNC00LjggMTAuMi04LjggMTQtNC44IDUuNS0xMC44LTEuNi0xMC4zLTctNS44IDQuOS04LjcgMTYtMTggMTQuNC00LjUtMy42LTcuOC0xMS4yLTExLjItMi41LTIuNyA0LjItMTAgMTAuMi0xMy45IDMuOC0xLjItNS42LTQtMTIuMi03LTMuMy0yLjIgNi40LTkgMTEtMTUuNCA4LjItMy42LTIuOSAyLjgtMTMuNy0xLjctMTMtNi44IDQuNi0xMC44IDE1LjctMjAuMyAxNC44LTMuNy00IDIuMy0xMS4xLTEuOC0xNS43LTQuNyA2LjEtMTAgMTUuMS0xOC4zIDE1LjctNC0zLjIuMi0xMi41LTIuNC0xMy44LTguNCA1LTE3LjQgMTQuMS0yOCAxMS4zIDQuMS0xNiAyMS41LTIxLjUgMzYtMjIuNyAyNS4xLTMuMSA1MS41IDIuNiA3NS43LTYuNSAzLjktMi40IDEzLjMtNS43IDEwLTExLjItMy00LjQgNy43LTIuNyA4LjctNy44LS42LTYuNCA1LTUuNSAxMC40LTYgMjQuNC0xLjEgNDguNSA0IDcyLjggNC45IDEuOCAxMS44LTExLjMgMjAuMS0yMiAxNi41LTUgLjgtMTIuNS0xMS42LTExLTIuNi0xIDQuOC0uNCAxMS00LjcgMTQuMm0tMjA3LjQtMjQuMmM1LjYgNS4xIDkuNi0xIDE0LjktMy4zYTE5NyAxOTcgMCAwIDAgNDguMy0yNy4zYzkuMi03LjYgMTcuMi0xNy41IDI5LjYtMjAgMjQuMi03LjMgNDkuOS02LjQgNzQuMS0xMy4yIDE4LjUtMjUuMiA0OS44LTM0LjMgNzYuMS00OC44IDUuOS0xLjggOC4yLTYuNyAxMC0xMiAxMC0xNS45IDIzLjctMjkuOSAzOS45LTM5LjVhMzcgMzcgMCAwIDEgMjUuNC00LjYgNDIgNDIgMCAwIDEtMTMuNyAyNi41YzUuOS0uMSAxMS0zLjggMTYuOC0zLjYgMiAxMC42LTkuNCAxNi4xLTE1LjUgMjIuNyAzLjQuOCAxNi40IDEuOCA5LjMgNS4yLTkgNi4yLTE5LjMgMTAuNS0yNy42IDE3LjggNy43IDEuNCA4LjYgMyAuOCA1LjgtNC4zIDIuOC0xMi40IDMuOC0xMy4yIDkuNCA1LjggMy42LTIuNiA3LTUuOSA4LjItNi4yIDEuNS0xMi44IDQuMi00LjUgOS0zLjEgNC43LTkuOSA1LjctMTUuNCA1LjIgMS43IDUuNCA0LjEgMTEuNC0yLjggMTMuOGExMDggMTA4IDAgMCAxLTUzLjYgMjIuNGMyNC41IDEuOCA0OS44LTIuNyA3MC43LTE2IDIuOC0zLjMgMTcuMy02LjkgOS4yLTkuNi0zLjgtMS42LTEyLTMuNC0xMi42LTYuMyAxMS40LTcgMjUuNy00LjUgMzcuOS04LjYuMy00LTkuMy0yLjktMTIuOS0zLjgtOC41LS43LTgtMi45LjItMy43IDEwLjQtMi44IDIyLjItMy4zIDMxLTEwLTcuMS0zLjQtMTYuMS0uNS0yMy43LTMuMiAxMi45LTUuNiAyOC4xLTYuMiAzOS43LTE0LjcgNS4zLTUuOS02LjgtNC0xMC4zLTMuOS03LjEgMS4zLTEwLjQtMi4yLTIuMy01LjEgMTMuOS0xMC4zIDMxLjQtMTYuOSA0MS4yLTMxLjcgMi4zLTMuMyA1LjQtMTMuMy0yLTkuOC05LjYgMy4zLTE4LjEgMTQuMS0yOS4yIDEwLjggMjEuOC0xNi45IDQyLjQtMzYgNTcuMy01OS4zLjgtNi44LTkuOC03LjUtMTIuNS0yLjItMTQgMTMuNC0yNi42IDI5LjMtNDQuNSAzNy44YTI4MSAyODEgMCAwIDAgNDMuNi01Ni40YzIuNy02IDkuOC0xMy4zIDYtMjAtNi4zLTUuMi0xNC4xLS40LTE3LjMgNS43LTEwLjkgMTQuMi0xOS4xIDMwLjctMzMgNDIuMyAxMi4xLTIzLjMgMjQuOC00OC4yIDI1LTc1IDAtNS42LTEtMTMuOC04LjYtMTIuNy02IDEtNC41IDEwLTcgMTQuNS01LjQgMTguNC04IDM4LjMtMTkgNTQuMyAyLjUtMTQuOSA2LjgtMzAuNSAzLjUtNDUuNS0xLjYtNi44LTEyLjUtMy45LTExIDIuOC0xMyA2NS45LTU3LjMgMTIzLjUtMTE1IDE1Ni44LTI2LjUgMTUtNTYgMjQuNi04Ni4yIDI5LTggMS43LTE2LjguNy0yNC41IDMuNS0xOC44IDE0LjMtMzAuMSAzOC40LTUzLjggNDUuOS0xMC43IDUuMy0yNC41IDYuNC0zMi4xIDE2LjJhOSA5IDAgMCAwLS44IDQuMm01MS43LTEwLjNxLTUuNC4yLTEwLjYgMS43Yy00LjcuNy05LjIgMi4zLTEzLjggM2wtMS45LjQtMy4xLjNhMTEgMTEgMCAwIDEgMCA1LjEgNiA2IDAgMCAxLTEuNCAycS0uOSAxLjItMi4yIDEuOGE3IDcgMCAwIDEtMi42LjdxLTEuMy4xLTIuNy0uNC0xLjMtLjQtMi41LTEuNWwtMi44LjVoLTIuNmwtMi44LTEtMi42LTEuM2MtMy40IDItNy4yIDMuOS05LjMgNy40YTExIDExIDAgMCAwLTEuNiA1LjNxLS4yIDMuNiAxLjQgN2MuNC42LjctMi4zIDEuOC0yLjdxMy0yLjQgNi43LTMuM2MyLTEgMS43IDAgLjkgMS42LS4yLjktMS4zIDQgLjIgMi40YTY1IDY1IDAgMCAxIDIxLjYtNC4xcTE1LjktMS41IDMxLjgtMS41bDMwIC42YzQuOC4yIDkuNiAxLjIgMTQuMy40IDEuMS0uMyAyLjktLjMgMy42LTEtMi4yLTEuMi00LjctMS4zLTctMS42aC0xOS4xYy01LjMtLjUtMTAuOC0uNi0xNS44LTIuNi0xLjQtLjUtMi42LTEuOC0zLjktLjRhMjQgMjQgMCAwIDEtNS45IDEuM3EtNS4zLjItMTAuMi0xLjggMy42LTQuNyA3LjctOWwtNi4yLTEuM3oiLz4KICAgICAgPGNpcmNsZSBjeD0iMTAyMCIgY3k9IjcyMC45IiByPSIyLjQiLz4KICAgICAgPGNpcmNsZSBjeD0iMTAxOS44IiBjeT0iNzIwLjUiIHI9IjEiIHN0cm9rZT0iI2ZmZWMyZCIgc3Ryb2tlLXdpZHRoPSIuNCIvPgogICAgPC9nPgogICAgPGcgdHJhbnNmb3JtPSJzY2FsZSguNTEyKSI+CiAgICAgIDxnIGlkPSJrei1mIj4KICAgICAgICA8ZyBpZD0ia3otZSI+CiAgICAgICAgICA8cGF0aCBkPSJNMTIwIDczcy05LjYtOC4yLTEyLjktNC4xYy01LjIgNi41IDE2LjIgMzkgMTYuMiA1MC40IDAgMTguOC0xMi42IDIzLjktMjggMjYuNS0xMC40IDEuOC0yNy4zLS43LTI3LjMtLjcgMy4yLTQuMyA1LjMtNS42IDEwLjYtNS45LTYtMy0xMi05LjgtMTItMjAuMyAwLTE2LjEgNi42LTIyLjggNi42LTQxQzczLjIgNjggNjUgNTUgNjUgNTVjMTQuNiAxLjUgMjEuOCAxNSAxNy43IDI1LjhhNyA3IDAgMCAwIDYuMy0xLjljMSAzLS42IDYuNS0yLjkgOS41IDEuOCAxIDMuMi40IDYtLjItLjIgMy0yIDYuNC02LjYgOS41IDEzLjItMy40IDIxLjIgNS43IDIxLjIgMTUuMyAwIDcuMy01IDEyLjUtMTAgMTIuNS0xLjYgMC00LS43LTUuMy0xLjctMSAyLS40IDQuNy41IDYuNy0zLjYtMS02LTMuMi00LjMtNy43cS00LjItLjMtNi41LTMgMi4zLTMgNi41LTNjLTItNC4yLjMtNi41IDMuNi04LjQgMCAwLTIuMSA4LjQgMy4yIDguNCAyLjQgMCA0LjYtLjcgNC42LTQuMyAwLTMuMS0yLjctNy40LTktNy4xcy0xMS4zIDQuMy0xMS4zIDE0LjNjMCA5LjIgNy41IDEzLjggMTcuMyAxNCA4LjguNCAxNS41LTQuNCAxNS41LTEzLjVDMTExLjUgMTA4IDk0IDgwLjQgOTQgNjkuNmMwLTguMSA3LjItMTIuNyAxNC40LTEyLjcgOS4yIDAgMTcgOS4yIDE3IDkuMmwtNS40IDYuOHoiLz4KICAgICAgICAgIDxwYXRoIGlkPSJrei1kIiBkPSJNMTIyIDI5Mi4xYzAgMjAuMy0xOC4yIDMwLjctMzIuNSAzMC43LTE5LjIgMC0yOS41LTExLjUtMjkuNS0yNi42IDAtOC41IDEuNi0xMy45IDUuNS0yMmw0NC4yLTkxLjdhMjcgMjcgMCAwIDAgMi0xMi4yYzAtOC4yLTgtMTQuOS0xNi4zLTE1LTcuNi0uMy0xNiA3LTE2IDE1LjMgMCAxMC4xIDUuMyAxNC42IDEwLjcgMTQuNiA2LjYgMCA5LjItMi43IDkuMi03LjRxLS4yLTQuNy0zLjgtNC42Yy01LjcgMC00IDcuNi00IDcuNmE1LjIgNS4yIDAgMCAxLTMuOS03IDEwIDEwIDAgMCAxLTUuNS0zLjNxMi4yLTIuMyA1LjUtM2MtMS4zLTQuNC41LTYuNSA0LjMtNy41YTggOCAwIDAgMC0uNSA0LjhjNi0xLjggMTUuMyAxIDE1LjMgMTEuNHMtNy4yIDE5LjEtMjAuNyAxN2MzLjIgMS41IDQuOCA0LjYgNS4yIDguMS0yLjUtMS01LjItMS01LjItMSAxLjYgMi43IDMuOCA1IDMuNyAxMC42LTIuNS0xLjItNC45LTMuMy04LTIgNSAxMC0xLjIgMjMuNi0xNyAyNi44cTguNi0xMC4zIDguNi0yMS4zYzAtMjMuNS02LjUtMjcuNC02LjUtNDMuOGEyNCAyNCAwIDAgMSAxMC41LTE5LjJ2LjNBMTQgMTQgMCAwIDEgNjggMTQ1YTYyIDYyIDAgMCAxIDM0IC4zIDI1IDI1IDAgMCAxIDE4IDEyIDM2IDM2IDAgMCAxIDAgMjguOWMtNi4zIDEzLTM1LjcgNzUuNi00NC45IDk1LjJxLTMgNi4zLTMuMSAxMy40YzAgMTIgMTEgMTYuMiAxNy4yIDE2LjIgNy41IDAgMTUuMi01LjcgMTUuMi0xMi44IDAtNC41LTIuNS03LjMtNi03LjMtOC41IDAtOCA3LjItNi4zIDExLjgtNS4zLTIuNC04LjMtNi42LTcuNS0xMWExNCAxNCAwIDAgMS04LjQtNC44YzItMi42IDQuNi00LjYgOC40LTQuNy0xLjctNi45IDMtOS44IDcuNS0xMS40LTEuNCA1LTIuNCAxMC45IDYuMyAxMC45IDYuMyAwIDExLjIgMSAxNC4xIDUuMmwuNy0yN2MuNC04LjEtMTAuOC04LTE4LTUuNSAyLjctOS4zIDguMi0xNC40IDIxLTEzLjFhMTAgMTAgMCAxLTYuNC05LjhjMC03LjYgNi4yLTE2IDEwLjItMTguNWwyIDc5eiIvPgogICAgICAgICAgPHVzZSB4bGluazpocmVmPSIja3otZCIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgdHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgLTEgMCA2NDUpIi8+CiAgICAgICAgPC9nPgogICAgICAgIDx1c2UgeGxpbms6aHJlZj0iI2t6LWUiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHRyYW5zZm9ybT0ibWF0cml4KC0xIDAgMCAxIDI0MCAwKSIvPgogICAgICA8L2c+CiAgICAgIDx1c2UgeGxpbms6aHJlZj0iI2t6LWYiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIC0xIDAgMTAwMCkiLz4KICAgIDwvZz4KICA8L2c+Cjwvc3ZnPgo=';

const decodeBase64 = (value) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (const char of value) {
    if (char === '=') break;
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
};

// Keep the path command explicit here as well: it avoids lossy SVG asset URI
// handling on Android while preserving the exact official path geometry.
const KZ_FULL_FLAG_XML = decodeBase64(KZ_FULL_FLAG_BASE64)
  .replace('a10 10 0 1-6.4-9.8', 'a10 10 0 0 1-6.4-9.8');

// The package exposes the complete standards-based SVG set. Keeping the
// namespace bundled makes every country picker deterministic and offline.
export const COUNTRY_FLAG_CODES = Object.freeze(
  Object.keys(FLAG_XML).filter((key) => /^[A-Z]{2}(?:-[A-Z]{2,3})?$/.test(key))
);

export const normalizeCountryCode = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  return countryCode(raw) || raw.toUpperCase();
};

export const isKnownCountryFlag = (value) => Boolean(FLAG_XML[normalizeCountryCode(value)]);
export const countryFlagXml = (value) => FLAG_XML[normalizeCountryCode(value)] || null;

const warnedCodes = new Set();
const warnMissingFlag = (code) => {
  if (!code || warnedCodes.has(code)) return;
  warnedCodes.add(code);
  console.warn(`[CountryFlag] no bundled artwork for country code: ${code}`);
};

const numericSize = (value, fallback = 24) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Canonical UrTruck flag renderer.
 *
 * Round mode intentionally uses three separate layers:
 *  1) a soft offset depth disc (visible on web/iOS/Android),
 *  2) a clean white circular shell,
 *  3) a square SVG artwork layer.
 *
 * Keeping the shadow outside the clipped SVG fixes the old issue where a
 * round flag could lose its depth because `overflow: hidden` clipped the
 * shadow on iOS/web. Square ISO artwork preserves full symbols inside the
 * circular badge: no emoji, no rectangular country chips and no stretched
 * flags.
 */
export default function CountryFlag({
  code,
  width = 24,
  height,
  round = true,
  style,
  testID,
  accessibilityLabel,
}) {
  const normalized = normalizeCountryCode(code);
  const xml = countryFlagXml(normalized);
  const resolvedWidth = numericSize(width);
  const resolvedHeight = round
    ? resolvedWidth
    : numericSize(height, Math.round(resolvedWidth * 2 / 3));
  const label = accessibilityLabel || (
    xml ? `Country flag: ${normalized}` : `Unknown country: ${normalized || 'none'}`
  );

  if (!xml) {
    warnMissingFlag(normalized);
    if (round) {
      return (
        <View
          testID={testID}
          accessibilityLabel={label}
          accessibilityRole="image"
          style={[s.roundRoot, s.unknownRoot, { width: resolvedWidth, height: resolvedHeight }, style]}
        >
          <View pointerEvents="none" style={s.depthDisc} />
          <View style={s.roundShell}>
            <View style={[s.roundClip, s.unknownRound]} />
          </View>
        </View>
      );
    }

    return (
      <View
        testID={testID}
        accessibilityLabel={label}
        accessibilityRole="image"
        style={[s.rectUnknown, { width: resolvedWidth, height: resolvedHeight }, style]}
      />
    );
  }

  if (!round) {
    return (
      <View
        testID={testID}
        accessibilityLabel={label}
        accessibilityRole="image"
        style={[s.rectFrame, { width: resolvedWidth, height: resolvedHeight }, style]}
      >
        <SvgXml xml={xml} width="100%" height="100%" />
      </View>
    );
  }

  const rim = Math.max(1, Math.round(resolvedWidth * 0.055));
  const useFullKzArtwork = normalized === 'KZ' && KZ_FULL_FLAG_XML;

  return (
    <View
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="image"
      style={[s.roundRoot, { width: resolvedWidth, height: resolvedHeight }, style]}
    >
      <View pointerEvents="none" style={s.depthDisc} />
      <View style={s.roundShell}>
        <View style={[s.roundClip, { margin: rim }]}>
          {useFullKzArtwork ? (
            <SvgXml xml={KZ_FULL_FLAG_XML} width="100%" height="100%" />
          ) : (
            <SvgXml xml={xml} width="100%" height="100%" />
          )}
        </View>
        <View pointerEvents="none" style={s.highlightRing} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  roundRoot: {
    position: 'relative',
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  depthDisc: {
    position: 'absolute',
    left: 1.5,
    top: 2.5,
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(77, 91, 98, 0.18)',
  },
  roundShell: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(27, 39, 34, 0.12)',
    shadowColor: '#5F6E76',
    shadowOpacity: 0.18,
    shadowRadius: 2.5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  roundClip: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.94)',
    backgroundColor: '#FFFFFF',
  },
  highlightRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.98)',
    borderLeftColor: 'rgba(255,255,255,0.90)',
    borderRightColor: 'rgba(99,112,119,0.10)',
    borderBottomColor: 'rgba(99,112,119,0.16)',
  },
  unknownRound: {
    margin: 1,
    backgroundColor: '#DDE6E0',
  },
  unknownRoot: {
    backgroundColor: '#DDE6E0',
  },
  rectFrame: {
    overflow: 'hidden',
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,34,28,0.12)',
    backgroundColor: '#FFFFFF',
  },
  rectUnknown: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,34,28,0.12)',
    backgroundColor: '#DDE6E0',
  },
});
