//@flow

import type {WizardPage, WizardPageActionHandler} from "../gui/base/WizardDialog"
import {WizardDialog} from "../gui/base/WizardDialog"
import {TextFieldN} from "../gui/base/TextFieldN"
import stream from "mithril/stream/stream.js"
import m from "mithril"
import {ButtonN, ButtonType} from "../gui/base/ButtonN"
import {isDomainName} from "../misc/FormatValidator"
import {Dialog} from "../gui/base/Dialog"
import {lang} from "../misc/LanguageViewModel"
import {createDnsRecordTable} from "./AddDomainDialog"
import {CustomDomainCheckResult, CustomDomainValidationResult, DnsRecordType} from "../api/common/TutanotaConstants"
import {worker} from "../api/main/WorkerClient"
import type {DnsRecord} from "../api/entities/sys/DnsRecord"
import {createDnsRecord} from "../api/entities/sys/DnsRecord"
import {showProgressDialog} from "../gui/base/ProgressDialog"
import {load} from "../api/main/Entity"
import {CustomerTypeRef} from "../api/entities/sys/Customer"
import {neverNull} from "../api/common/utils/Utils"
import {logins} from "../api/main/LoginController"
import type {CustomerInfo} from "../api/entities/sys/CustomerInfo"
import {CustomerInfoTypeRef} from "../api/entities/sys/CustomerInfo"
import {EditAliasesFormN} from "./EditAliasesFormN"
import * as AddUserDialog from "./AddUserDialog"
import {DomainDnsStatus} from "./DomainDnsStatus"
import type {CustomDomainCheckReturn} from "../api/entities/sys/CustomDomainCheckReturn"

export type AddDomainData = {
	domain: Stream<string>,
	emailAlias: ?string,
	customerInfo: CustomerInfo
}


export function showAddDomainWizard(): void {

	load(CustomerTypeRef, neverNull(logins.getUserController().user.customer))
		.then(customer => load(CustomerInfoTypeRef, customer.customerInfo))
		.then(customerInfo => {
			const domainData: AddDomainData = {
				domain: stream(""),
				emailAlias: null,
				customerInfo: customerInfo
			}

			const wizardPages = [
				new EnterDomainPage(domainData),
				new ValidateOwnershipPage(domainData),
				new AddEmailAddressesPage(domainData),
				new VerifyMailDelivery(domainData)
			]

			const wizard = new WizardDialog(wizardPages, () => {
				// close action - cleanup
				return Promise.resolve()
			})
			wizard.show()
		})


}


class VerifyMailDelivery implements WizardPage<AddDomainData> {

	_addDomainData: AddDomainData
	_pageActionHandler: WizardPageActionHandler<AddDomainData>
	_domainStatus: DomainDnsStatus

	constructor(addDomainData: AddDomainData) {
		this._addDomainData = addDomainData;
		this._domainStatus = new DomainDnsStatus(this._addDomainData.domain())
	}

	view(vnode: Vnode<any>): Children {
		return [
			m(".mt-l", ""),
			m("p.mb", "Finally you have to configure the DNS records listed below to enable mail delivery to and from the Tutanota mail server."),
			this._domainStatus.status.isLoaded() ? m("", this._renderCheckResult(this._domainStatus.status.getLoaded())) : m("", "..loading"),
			m(".flex-center.full-width.pt-l",
				m("", {style: {width: "260px"}},
					m(ButtonN, {
						type: ButtonType.Login,
						label: () => "Finish",
						click: () => this._updateDnsStatus()
					})
				)
			),
		]
	}

	_updateDnsStatus() {
		this._domainStatus = new DomainDnsStatus(this._addDomainData.domain())
		this._domainStatus.loadCurrentStatus().then(() => {
			m.redraw()
		})
	}

	_renderCheckResult(result: CustomDomainCheckReturn): ChildArray {
		if (result.checkResult === CustomDomainCheckResult.CUSTOM_DOMAIN_CHECK_RESULT_OK) {
			let array = []
			if (result.missingRecords.length > 0 || result.invalidRecords.length > 0) {
				if (result.missingRecords.filter(r => r.type !== DnsRecordType.DNS_RECORD_TYPE_TXT_DMARC).length > 0) {
					array.push(m(".mt-m.mb-s", lang.get("setDnsRecords_msg")))
					array.push(createDnsRecordTable(result.missingRecords.filter(r => r.type !== DnsRecordType.DNS_RECORD_TYPE_TXT_DMARC)))
				}

				if (result.invalidRecords.length > 0) {
					array.push(m(".mt-m.mb-s", lang.get("deleteDnsRecords_msg")))
					array.push(createDnsRecordTable(result.invalidRecords))
				}

				let recommendedDmarc = result.missingRecords.find(r => r.type === DnsRecordType.DNS_RECORD_TYPE_TXT_DMARC)
				if (recommendedDmarc) {
					array.push(m(".mt-m.mb-s", lang.get("recommendedDmarcRecord_msg")))
					array.push(createDnsRecordTable([recommendedDmarc]))
				}

				array.push(m("span.small.mt-m", lang.get("moreInfo_msg") + " "))
				array.push(m("span.small", m(`a[href=${lang.getInfoLink("domainInfo_link")}][target=_blank]`, lang.getInfoLink("domainInfo_link"))))
			}
			return array
		} else {
			let errorMessageMap = {}
			errorMessageMap[CustomDomainCheckResult.CUSTOM_DOMAIN_CHECK_RESULT_DNS_LOOKUP_FAILED] = "customDomainErrorDnsLookupFailure_msg"
			errorMessageMap[CustomDomainCheckResult.CUSTOM_DOMAIN_CHECK_RESULT_DOMAIN_NOT_FOUND] = "customDomainErrorDomainNotFound_msg"
			errorMessageMap[CustomDomainCheckResult.CUSTOM_DOMAIN_CHECK_RESULT_NAMESERVER_NOT_FOUND] = "customDomainErrorNameserverNotFound_msg"
			return [lang.get(errorMessageMap[result.checkResult])]
		}
	}


	headerTitle() {
		return lang.get("checkDnsRecords_action")
	};

	nextAction(): Promise<AddDomainData> {
		return Promise.resolve(this._addDomainData)
	};

	isNextAvailable() {return false};

	getUncheckedWizardData() { return this._addDomainData};

	setPageActionHandler(handler: WizardPageActionHandler<AddDomainData>) {
		this._pageActionHandler = handler
	};

	updateWizardData(wizardData: AddDomainData) {
		this._addDomainData = wizardData
		this._updateDnsStatus()
	};

	isEnabled(data: AddDomainData) { return true;};
}


class AddEmailAddressesPage implements WizardPage<AddDomainData> {

	_addDomainData: AddDomainData
	_pageActionHandler: WizardPageActionHandler<AddDomainData>

	constructor(addDomainData: AddDomainData) {
		this._addDomainData = addDomainData;
	}

	view(vnode: Vnode<any>): Children {


		return [
			m(".mt-l", "The domain is assigned to your account and you are able to configure email addresses for this domain."),
			m("p.mb", "Use either email aliases if you want to set a custom domain address for your current user or if you want to create email addresses for members of your organization or family please add additional users."),

			m(EditAliasesFormN, {
				userGroupInfo: logins.getUserController().userGroupInfo,
				showHeader: false,
				hideExpander: true
			}),
			m(".flex-center.full-width.pt-l",
				m("", {style: {width: "260px"}},
					m(ButtonN, {
						type: ButtonType.Login,
						label: () => "Next",
						click: () => this._checkEmailAddresses()
					})
				)
			),
			m(".flex-center.full-width.pt",
				m("",
					m(ButtonN, {
						type: ButtonType.Secondary,
						label: () => "Add user",
						click: () => AddUserDialog.show()
					})
				)
			),
		]
	}


	_checkEmailAddresses() {
		this._pageActionHandler.showNext(this._addDomainData)
	}

	headerTitle() {
		return "Add Email aliases"
	};

	nextAction(): Promise<AddDomainData> {
		return Promise.resolve(this._addDomainData)
	};

	isNextAvailable() {return false};

	getUncheckedWizardData() { return this._addDomainData};

	setPageActionHandler(handler: WizardPageActionHandler<AddDomainData>) {
		this._pageActionHandler = handler
	};

	updateWizardData(wizardData: AddDomainData) {
		this._addDomainData = wizardData
	};

	isEnabled(data: AddDomainData) { return true;};
}


class ValidateOwnershipPage implements WizardPage<AddDomainData> {

	_addDomainData: AddDomainData
	_pageActionHandler: WizardPageActionHandler<AddDomainData>
	_expectedValidationRecord: DnsRecord

	constructor(addDomainData: AddDomainData) {
		this._addDomainData = addDomainData;
		this._expectedValidationRecord = createDnsRecord();
		this._expectedValidationRecord.type = DnsRecordType.DNS_RECORD_TYPE_TXT_SPF // not actually spf, but the type TXT only matters here
		this._expectedValidationRecord.subdomain = null
		this._expectedValidationRecord.value = "" // will be filled below very soon
	}

	view(vnode: Vnode<any>): Children {
		return [

			m(".mt-l", "We need to verify that you are the owner of the domain: " + this._addDomainData.domain()),
			m("p.mb", "Please configure a new DNS record of type TXT with the value shown below."),
			createDnsRecordTable([this._expectedValidationRecord]),
			m(".flex-center.full-width.pt-l", m("", {style: {width: "260px"}}, m(ButtonN, {
				type: ButtonType.Login,
				label: () => "Next",
				click: () => this._addDomain()
			})))

		]
	}

	_loadExpectedVerifier() {
		this._expectedValidationRecord.value = ""
		worker.getDomainValidationRecord().then(recordValue => {
			this._expectedValidationRecord.value = recordValue
			m.redraw()
		})
	}


	_addDomain() {
		if (true) { // TODO remove
			this._pageActionHandler.showNext(this._addDomainData)
			return
		}
		showProgressDialog("pleaseWait_msg", worker.addDomain(this._addDomainData.domain()).then(result => {
			if (result.validationResult === CustomDomainValidationResult.CUSTOM_DOMAIN_VALIDATION_RESULT_OK) {
				this._pageActionHandler.showNext(this._addDomainData)
			} else {

				let errorMessageMap = {}
				errorMessageMap[CustomDomainValidationResult.CUSTOM_DOMAIN_VALIDATION_RESULT_DNS_LOOKUP_FAILED] = "customDomainErrorDnsLookupFailure_msg"
				errorMessageMap[CustomDomainValidationResult.CUSTOM_DOMAIN_VALIDATION_RESULT_DOMAIN_NOT_FOUND] = "customDomainErrorDomainNotFound_msg"
				errorMessageMap[CustomDomainValidationResult.CUSTOM_DOMAIN_VALIDATION_RESULT_NAMESERVER_NOT_FOUND] = "customDomainErrorNameserverNotFound_msg"
				errorMessageMap[CustomDomainValidationResult.CUSTOM_DOMAIN_VALIDATION_RESULT_DOMAIN_NOT_AVAILABLE] = "customDomainErrorDomainNotAvailable_msg"
				errorMessageMap[CustomDomainValidationResult.CUSTOM_DOMAIN_VALIDATION_RESULT_VALIDATION_FAILED] = "customDomainErrorValidationFailed_msg"
				let errorMessage = () => lang.get(errorMessageMap[result.validationResult])
					+ ((result.invalidDnsRecords.length > 0) ? " " + lang.get("customDomainErrorOtherTxtRecords_msg") + "\n"
						+ result.invalidDnsRecords.map(r => r.value).join("\n") : "")
				return errorMessage
			}
		})).then(message => {
			if (message) {
				Dialog.error(message)
			}
		})
	}


	headerTitle() {
		return "Verify ownership"
	};

	nextAction(): Promise<AddDomainData> {
		return Promise.resolve(this._addDomainData)

	};

	isNextAvailable() {return false};

	getUncheckedWizardData() { return this._addDomainData};

	setPageActionHandler(handler: WizardPageActionHandler<AddDomainData>) {
		this._pageActionHandler = handler
	};

	updateWizardData(wizardData: AddDomainData) {
		this._loadExpectedVerifier()
		this._addDomainData = wizardData
	};

	isEnabled(data: AddDomainData) { return true;};
}


class EnterDomainPage implements WizardPage<AddDomainData> {

	_addDomainData: AddDomainData
	_pageActionHandler: WizardPageActionHandler<AddDomainData>;

	constructor(addDomainData: AddDomainData) {
		this._addDomainData = addDomainData;
	}

	view(vnode: Vnode<any>): Children {
		return [
			m(".mt-l", "With Tutanota you can use your custom email domain in just a few steps."),
			m("p", "Start the process by entering your main domain into the input field and press next."),
			m("p", "You will need to make changes to your DNS configuration. Please open a new browser window and log in to the administration panel of your domain provider to apply changes when necessary. We will show you which DNS records are required in each step. "),

			m(TextFieldN, {
					label: () => "Custom email domain",
					value: this._addDomainData.domain,
				}
			),
			m(".flex-center.full-width.pt-l", m("", {style: {width: "260px"}}, m(ButtonN, {
				type: ButtonType.Login,
				label: () => "Next",
				click: () => this._checkDomain()
			})))

		]
	}

	_checkDomain() {
		let cleanDomainName = this._addDomainData.domain().toLocaleLowerCase().trim()
		if (!isDomainName(cleanDomainName)) {
			Dialog.error("customDomainNeutral_msg")
		} else if (this._addDomainData.customerInfo.domainInfos.find(info => info.domain === cleanDomainName)) {
			Dialog.error("customDomainDomainAssigned_msg")
		} else {
			this._pageActionHandler.showNext(this._addDomainData)
		}
	}

	headerTitle() {
		return "Enter email domain"
	}


	nextAction(): Promise<AddDomainData> {
		return Promise.resolve(this._addDomainData)
	}

	isNextAvailable() {
		return false
	}

	getUncheckedWizardData() {
		return this._addDomainData
	}

	setPageActionHandler(handler: WizardPageActionHandler<AddDomainData>) {
		this._pageActionHandler = handler
	}

	updateWizardData(wizardData: AddDomainData) {
		this._addDomainData = wizardData
	}

	isEnabled(data: AddDomainData) {
		return true;
	}
}


