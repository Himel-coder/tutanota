// @flow
import o from "ospec/ospec.js"
import n from "../nodemocker"

o.spec("DesktopContextMenu Test", () => {
	n.startGroup({
		group: __filename,
		allowables: [],
	})

	const lang = {
		lang: {get: key => key}
	}

	const electron = {
		clipboard: {
			writeText: () => {}
		},
		Menu: n.classify({
			prototype: {
				append: function () {},
				popup: function () {},
			},
			statics: {}
		}),
		MenuItem: n.classify({
			prototype: {
				enabled: true,
				constructor: function (p) {
					Object.assign(this, p)
				}
			},
			statics: {}
		})
	}

	const ipc = {}

	const standardMocks = () => {
		// node modules
		const electronMock = n.mock('electron', electron).set()
		const langMock = n.mock("../misc/LanguageViewModel", lang).set()
		const ipcMock = n.mock('__ipc', ipc).set()

		return {
			electronMock,
			langMock,
			ipcMock,
		}
	}

	o("can handle undefined browserWindow and webContents in callback", () => {
		const {electronMock, ipcMock} = standardMocks()
		const {DesktopContextMenu} = n.subject("../../src/desktop/DesktopContextMenu.js")
		const contextMenu = new DesktopContextMenu(ipcMock)
		contextMenu.open({
			linkURL: "nourl",
			editFlags: {
				canCut: false,
				canPaste: false,
				canCopy: false,
				canUndo: false,
				canRedo: false
			},
			dictionarySuggestions: [],
			misspelledWord: ""
		})
		electronMock.MenuItem.mockedInstances.forEach(i => i.click && i.click(undefined, undefined))
		electronMock.MenuItem.mockedInstances.forEach(i => i.click && i.click(undefined, "nowebcontents"))
	})
})