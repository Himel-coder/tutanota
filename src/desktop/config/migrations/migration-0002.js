// @flow
function migrate(oldConfig: any) {
	return Object.assign(oldConfig, {"desktopConfigVersion": 2, "spellcheck": true})
}

export const migrateClient = migrate
export const migrateAdmin = migrate