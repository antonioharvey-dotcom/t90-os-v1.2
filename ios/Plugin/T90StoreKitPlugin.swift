import Foundation
import StoreKit
import Capacitor

/**
 * T90StoreKitPlugin — Native StoreKit 2 bridge for Capacitor.
 *
 * Registered as "StoreKit" in the Capacitor plugin registry (see .m file).
 * Exposes the exact JavaScript contract expected by src/lib/appStoreIAP.js
 * and src/lib/native/storeKitBridge.js.
 *
 * Requirements:
 *   - iOS 15.0+ (StoreKit 2 async/await API)
 *   - In-App Purchase capability enabled in the app target
 *   - StoreKit configuration file for local/sandbox testing
 *
 * Methods:
 *   getProducts(productIds)           → localized product metadata
 *   purchase(productId)               → purchase flow with verification
 *   restorePurchases()               → restore verified transactions
 *   finishTransaction(transactionId) → finish a StoreKit transaction
 *   openSubscriptionManagement()      → native manage-subscriptions sheet
 *
 * Transaction Updates:
 *   A single Transaction.updates listener is started on plugin load.
 *   Events are emitted to JS via "storekit:transaction-update".
 *   Only one listener task runs per app session (guarded).
 *   Transactions are finished only after the JS layer acknowledges,
 *   except for external transactions (renewals, revocations, refunds)
 *   which are auto-finished after emitting the event since the backend
 *   has already been notified via Apple Server Notifications V2.
 */
@objc(T90StoreKitPlugin)
public class T90StoreKitPlugin: CAPPlugin {

    // Single transaction listener task — one per app session.
    private var transactionListenerTask: Task<Void, Never>?

    // MARK: - Plugin Lifecycle

    public override func load() {
        super.load()
        startTransactionListener()
        Task {
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result {
                    var payload = self.transactionPayload(for: transaction)
                    payload["status"] = "verified"
                    self.notifyListeners("storekit:transaction-update", data: payload, retainUntilConsumed: true)
                }
            }
        }
    }

    // MARK: - Transaction Update Stream

    private func startTransactionListener() {
        guard transactionListenerTask == nil else { return }
        transactionListenerTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self = self else { return }
                switch result {
                case .verified(let transaction):
                    var payload = self.transactionPayload(for: transaction)
                    payload["status"] = "verified"
                    payload["eventType"] = self.eventType(for: transaction)
                    self.notifyListeners("storekit:transaction-update", data: payload, retainUntilConsumed: true)
                    // External transactions (renewals, revocations, refunds) are
                    // auto-finished — the backend is already notified via Apple
                    // Server Notifications V2. Purchase-initiated transactions are
                    // finished in the purchase() method.
                    // Leave unfinished until the backend acknowledges.

                case .unverified(let transaction, let error):
                    self.notifyListeners("storekit:transaction-update", data: [
                        "status": "unverified",
                        "eventType": "unverified",
                        "transactionId": String(transaction.id),
                        "error": error.localizedDescription
                    ])
                @unknown default:
                    break
                }
            }
        }
    }

    // MARK: - getProducts

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let productIds = call.getArray("productIds", String.self),
              !productIds.isEmpty else {
            call.reject("productIds is required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: Set(productIds))
                // productDict now resolves introductory-offer eligibility via
                // StoreKit's async isEligibleForIntroOffer API, so it must be
                // awaited per product.
                var result: [[String: Any]] = []
                for product in products {
                    result.append(await self.productDict(for: product))
                }
                call.resolve(["products": result])
            } catch {
                call.reject("Failed to fetch products: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - purchase

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }
        // Optional correlation identifier for analytics traceability.
        let correlationId = call.getString("correlationId")

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Product not found")
                    return
                }

                var options: Set<Product.PurchaseOption> = []
                if let token = call.getString("appAccountToken"),
                   let uuid = UUID(uuidString: token) {
                    options.insert(.appAccountToken(uuid))
                }
                let result = try await product.purchase(options: options)

                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        var payload = self.transactionPayload(for: transaction)
                        payload["status"] = "success"
                        payload["verificationState"] = "verified"
                        if let cid = correlationId { payload["correlationId"] = cid }
                        call.resolve(payload)
                        // JS acknowledges after durable backend verification.

                    case .unverified(let transaction, let error):
                        call.resolve([
                            "status": "failed",
                            "verificationState": "unverified",
                            "transactionId": String(transaction.id),
                            "productId": transaction.productID,
                            "error": error.localizedDescription
                        ])
                    }

                case .userCancelled:
                    call.reject("USER_CANCELLED")

                case .pending:
                    call.resolve([
                        "status": "pending",
                        "productId": productId
                    ])

                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - restorePurchases

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            try? await AppStore.sync()
            var restored: [[String: Any]] = []

            for await result in Transaction.currentEntitlements {
                switch result {
                case .verified(let transaction):
                    var payload = self.transactionPayload(for: transaction)
                    payload["status"] = "restored"
                    payload["verificationState"] = "verified"
                    restored.append(payload)

                case .unverified(_, _):
                    continue
                }
            }

            if restored.isEmpty {
                call.resolve(["transactions": [], "restored": false])
            } else {
                call.resolve(["transactions": restored, "restored": true])
            }
        }
    }

    // MARK: - finishTransaction

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let transactionId = call.getString("transactionId") else {
            call.reject("transactionId is required")
            return
        }
        Task {
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, String(transaction.id) == transactionId {
                    await transaction.finish()
                    call.resolve(["finished": true])
                    return
                }
            }
            // Already finished is an idempotent acknowledgement.
            call.resolve(["finished": true])
        }
    }

    // MARK: - openSubscriptionManagement

    @objc func openSubscriptionManagement(_ call: CAPPluginCall) {
        Task {
            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
                do {
                    try await AppStore.showManageSubscriptions(in: windowScene)
                    call.resolve(["opened": true])
                } catch {
                    // Fallback: open the App Store subscriptions URL
                    if let url = URL(string: "itms-apps://apps.apple.com/account/subscriptions") {
                        await UIApplication.shared.open(url)
                        call.resolve(["opened": true])
                    } else {
                        call.reject("Failed to open subscription management: \(error.localizedDescription)")
                    }
                }
            } else {
                call.reject("Could not find active window scene")
            }
        }
    }

    // MARK: - Helpers

    private func productDict(for product: Product) async -> [String: Any] {
        var dict: [String: Any] = [
            "productId": product.id,
            "displayName": product.displayName,
            "description": product.description,
            "price": product.price,
            "currencyCode": product.priceFormatStyle.currencyCode ?? "USD",
            "type": productTypeString(product.type)
        ]

        // Localized display price from StoreKit formatting
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = product.priceFormatStyle.locale
        dict["priceString"] = formatter.string(from: product.price) ?? ""

        // Subscription metadata + introductory offer
        if case .autoRenewable = product.type, let sub = product.subscription {
            dict["subscriptionPeriod"] = periodString(sub.subscriptionPeriod)
            dict["subscriptionPeriodUnit"] = periodUnitString(sub.subscriptionPeriod)

            // "An introductory offer is configured" is NOT the same as "this
            // customer is eligible." Resolve eligibility via StoreKit's actual
            // isEligibleForIntroOffer API; if it cannot be determined, default
            // to false so no trial/intro claim is rendered.
            if let intro = sub.introductoryOffer {
                dict["introductoryOfferAvailable"] = true
                dict["introductoryOfferDuration"] = periodString(intro.period)
                dict["introductoryOfferPaymentMode"] = paymentModeString(intro.paymentMode)
                // Localized introductory-offer price + raw decimal, so paid offers
                // (payUpFront / payAsYouGo) can be disclosed with the amount charged.
                dict["introductoryOfferDisplayPrice"] = intro.displayPrice
                dict["introductoryOfferPrice"] = intro.price
                // Customer eligibility — never derived from offer existence.
                let eligible = await sub.isEligibleForIntroOffer
                dict["introductoryOfferEligible"] = eligible
            } else {
                dict["introductoryOfferAvailable"] = false
                dict["introductoryOfferEligible"] = false
            }

            // Promotional offers (if any)
            if !sub.promotionalOffers.isEmpty {
                dict["promotionalOffersAvailable"] = true
            }
        }

        return dict
    }

    private func transactionPayload(for transaction: Transaction) -> [String: Any] {
        var payload: [String: Any] = [
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID,
            "purchaseDate": Int(transaction.purchaseDate.timeIntervalSince1970 * 1000)
        ]

        if #available(iOS 16.0, *) {
            payload["environment"] = transaction.environment.rawValue
        } else if let json = try? JSONSerialization.jsonObject(with: transaction.jsonRepresentation) as? [String: Any],
                  let environment = json["environment"] as? String {
            payload["environment"] = environment
        }

        if let expirationDate = transaction.expirationDate {
            payload["expirationDate"] = Int(expirationDate.timeIntervalSince1970 * 1000)
        }

        if let revocationDate = transaction.revocationDate {
            payload["revocationDate"] = Int(revocationDate.timeIntervalSince1970 * 1000)
            if let reason = transaction.revocationReason {
                payload["revocationReason"] = reason.rawValue
            }
        }

        payload["ownershipType"] = transaction.ownershipType == .familyShared ? "family_shared" : "purchased"

        // JSON representation for backend verification context
        payload["jsonRepresentation"] = String(data: transaction.jsonRepresentation, encoding: .utf8) ?? ""

        // Ownership verification
        payload["appAccountToken"] = transaction.appAccountToken?.uuidString ?? ""

        return payload
    }

    private func eventType(for transaction: Transaction) -> String {
        if transaction.revocationDate != nil { return "revocation" }
        if #available(iOS 17.0, *) {
            if transaction.reason == .purchase { return "purchase" }
            if transaction.reason == .renewal { return "renewal" }
        }
        return "unknown"
    }

    private func productTypeString(_ type: Product.ProductType) -> String {
        switch type {
        case .autoRenewable: return "auto_renewable"
        case .nonRenewable: return "non_renewable"
        case .consumable: return "consumable"
        case .nonConsumable: return "non_consumable"
        @unknown default: return "unknown"
        }
    }

    private func periodString(_ period: Product.SubscriptionPeriod) -> String {
        switch period.unit {
        case .day: return "\(period.value) days"
        case .week: return "\(period.value) weeks"
        case .month: return "\(period.value) months"
        case .year: return "\(period.value) years"
        @unknown default: return "unknown"
        }
    }

    private func periodUnitString(_ period: Product.SubscriptionPeriod) -> String {
        switch period.unit {
        case .day: return "day"
        case .week: return "week"
        case .month: return "month"
        case .year: return "year"
        @unknown default: return "unknown"
        }
    }

    private func paymentModeString(_ mode: Product.SubscriptionOffer.PaymentMode) -> String {
        switch mode {
        case .freeTrial: return "free_trial"
        case .payAsYouGo: return "pay_as_you_go"
        case .payUpFront: return "pay_up_front"
        @unknown default: return "unknown"
        }
    }

    deinit {
        transactionListenerTask?.cancel()
    }
}