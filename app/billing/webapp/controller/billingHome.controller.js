sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (Controller, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) {
    "use strict";

    return Controller.extend("billing.controller.billingHome", {

        onInit() {

            const oViewModel = new JSONModel({
                dealerName: "",
                fundAvailability: "",
                limitAvailability: "",
                infOtherAmount: "",
                infType: "",
                selectedDealerID: "",
                dealerSelected: false,

                Model: [],

                totalStock: 0,
                totalAvailable: 0,
                totalFundRequired: 0,
                totalAllocationQty: 0,
                totalOrderValue: 0,

                modelDetails: [],
                showModelDetails: false,
                calculateEnabled: false,
                saveEnabled: false

            });

            this.getView().setModel(oViewModel, "view");
        },

        onDealerSuggest(oEvent) {

            const sValue = oEvent.getParameter("suggestValue")?.trim();
            const oBinding = oEvent.getSource().getBinding("suggestionRows");

            if (!oBinding) return;

            if (!sValue) {
                oBinding.filter([]);
                return;
            }

            const oFilter = new Filter({
                filters: [
                    new Filter("dealerID", FilterOperator.StartsWith, sValue),
                    new Filter("dealerName", FilterOperator.Contains, sValue)
                ],
                and: false
            });

            oBinding.filter([oFilter]);
        },

        onDealerSelect(oEvent) {

            const oRow = oEvent.getParameter("selectedRow");
            if (!oRow) return;

            const oDealer = oRow.getBindingContext().getObject();
            const sDealerID = oDealer.dealerID;

            const oODataModel = this.getView().getModel();
            const oViewModel = this.getView().getModel("view");

            oViewModel.setProperty("/selectedDealerID", sDealerID);

            oODataModel.bindContext(`/Dealer('${sDealerID}')`)
                .requestObject()
                .then(oFullDealer => {

                    oViewModel.setProperty("/dealerName", oFullDealer.dealerName);
                    oViewModel.setProperty("/fundAvailability", oFullDealer.fundAvailability);
                    oViewModel.setProperty("/limitAvailability", oFullDealer.limitAvailability);
                    oViewModel.setProperty("/infOtherAmount", oFullDealer.infOtherAmount);
                    oViewModel.setProperty("/infType", oFullDealer.infType);
                    oViewModel.setProperty("/dealerSelected", true);
                });
        },

        onDealerLiveChange(oEvent) {

            const sValue = oEvent.getParameter("value");
            const oViewModel = this.getView().getModel("view");

            if (!sValue || sValue.trim() === "") {

                oViewModel.setProperty("/dealerName", "");
                oViewModel.setProperty("/fundAvailability", "");
                oViewModel.setProperty("/limitAvailability", "");
                oViewModel.setProperty("/infOtherAmount", "");
                oViewModel.setProperty("/infType", "");
                oViewModel.setProperty("/selectedDealerID", "");
                oViewModel.setProperty("/dealerSelected", false);
            }
            else {
                oViewModel.setProperty("/dealerSelected", false);
            }
        },

        async onDealerGo() {

            const oViewModel = this.getView().getModel("view");
            const oODataModel = this.getView().getModel();
            const oWizard = this.byId("BillingWizard");
            const oDealerStep = this.byId("DealerStep");

            const sDealerID = oViewModel.getProperty("/selectedDealerID");
            const sDealerType = oViewModel.getProperty("/infType");
            const fFund = parseFloat(oViewModel.getProperty("/fundAvailability")) || 0;
            const fLimit = parseFloat(oViewModel.getProperty("/limitAvailability")) || 0;

            const MIN_FUND = 200000;

            if (!sDealerID) {
                MessageBox.error("Please select a dealer.");
                return;
            }

            if (fFund <= MIN_FUND) {
                MessageBox.error("Fund Availability must be above 2 Lakhs.");
                return;
            }

            if (sDealerType === "INF" && fLimit !== 0) {
                MessageBox.error("INF dealer must have Limit Available = 0.");
                return;
            }

            if (sDealerType === "NON-INF" && fLimit === 0) {
                MessageBox.error("NON-INF dealer must have Limit Available greater than 0.");
                return;
            }

            try {

                const oListBinding = oODataModel.bindList("/Model");
                const aContexts = await oListBinding.requestContexts();

                const aModels = aContexts.map(ctx => {

                    const obj = ctx.getObject();

                    return {
                        ...obj,
                        _context: ctx,
                        allocationQty: 0,
                        orderValue: 0
                    };
                });

                oViewModel.setProperty("/Model", aModels);

                oDealerStep.setValidated(true);
                oWizard.nextStep();

                this._calculateInitialTotals();

            } catch (err) {
                MessageBox.error("Error loading models.");
            }
        }
        ,

        onAllocationChange(oEvent) {

            const oInput = oEvent.getSource();
            const oContext = oInput.getBindingContext("view");
            const oModel = this.getView().getModel("view");

            if (!oContext) return;

            const sPath = oContext.getPath();

            let iQty = parseInt(oInput.getValue(), 10) || 0;

            const availableStock = parseInt(
                oModel.getProperty(sPath + "/availableStock"), 10
            ) || 0;


            if (iQty < 0) {
                iQty = 0;
            }

            if (iQty > availableStock) {

                iQty = availableStock;

                sap.m.MessageToast.show(
                    "Allocation cannot exceed Available Stock (" + availableStock + ")"
                );
            }

            oModel.setProperty(sPath + "/allocationQty", iQty);

            const aModels = oModel.getProperty("/Model") || [];

            const hasValue = aModels.some(model =>
                parseInt(model.allocationQty, 10) > 0
            );

            oModel.setProperty("/calculateEnabled", hasValue);
            oModel.setProperty("/saveEnabled", false);

        },

        onCalculateAllocation() {

            const oViewModel = this.getView().getModel("view");
            const aModels = oViewModel.getProperty("/Model") || [];
            const dealerFund = parseFloat(oViewModel.getProperty("/fundAvailability")) || 0;

            let totalOrderValue = 0;


            aModels.forEach(model => {

                const qty = parseInt(model.allocationQty, 10) || 0;
                const price = parseFloat(model.perBikeValue) || 0;

                totalOrderValue += qty * price;
            });


            if (totalOrderValue > dealerFund) {

                MessageBox.error(
                    "Total Order Value (" + totalOrderValue.toLocaleString() +
                    ") exceeds Dealer Fund (" + dealerFund.toLocaleString() + ")."
                );

                return;
            }

            let totalStock = 0;
            let totalAvailable = 0;
            let totalFundRequired = 0;
            let totalAllocationQty = 0;

            aModels.forEach(model => {

                const qty = parseInt(model.allocationQty, 10) || 0;
                const price = parseFloat(model.perBikeValue) || 0;

                model.orderValue = qty * price;

                totalStock += parseFloat(model.depotStock) || 0;
                totalAvailable += parseFloat(model.availableStock) || 0;
                totalFundRequired += parseFloat(model.fundRequired) || 0;
                totalAllocationQty += qty;
            });

            oViewModel.setProperty("/Model", aModels);
            oViewModel.setProperty("/totalStock", totalStock);
            oViewModel.setProperty("/totalAvailable", totalAvailable);
            oViewModel.setProperty("/totalFundRequired", totalFundRequired);
            oViewModel.setProperty("/totalAllocationQty", totalAllocationQty);
            oViewModel.setProperty("/totalOrderValue", totalOrderValue);

            MessageToast.show("Allocation calculated successfully.");
            oViewModel.setProperty("/saveEnabled", true);

        },

        _resetTotals() {

            const oViewModel = this.getView().getModel("view");

            oViewModel.setProperty("/totalStock", 0);
            oViewModel.setProperty("/totalAvailable", 0);
            oViewModel.setProperty("/totalFundRequired", 0);
            oViewModel.setProperty("/totalAllocationQty", 0);
            oViewModel.setProperty("/totalOrderValue", 0);
        },

        _calculateInitialTotals() {

            const oViewModel = this.getView().getModel("view");
            const aModels = oViewModel.getProperty("/Model") || [];

            let totalStock = 0;
            let totalAvailable = 0;
            let fundRequired = 0;

            aModels.forEach(model => {

                totalStock += parseFloat(model.depotStock) || 0;
                totalAvailable += parseFloat(model.availableStock) || 0;
                fundRequired += parseFloat(model.fundRequired) || 0;
            });

            oViewModel.setProperty("/totalStock", totalStock);
            oViewModel.setProperty("/totalAvailable", totalAvailable);
            oViewModel.setProperty("/totalFundRequired", fundRequired);
            oViewModel.setProperty("/totalAllocationQty", 0);
            oViewModel.setProperty("/totalOrderValue", 0);
        },

        onModelSelect(oEvent) {

            const oContext = oEvent.getSource().getBindingContext("view");
            if (!oContext) return;

            const oSelected = oContext.getObject();
            const oViewModel = this.getView().getModel("view");

            const aCurrent = oViewModel.getProperty("/modelDetails") || [];

            if (aCurrent.length && aCurrent[0].modelCode === oSelected.modelCode) {
                oViewModel.setProperty("/showModelDetails", false);
                oViewModel.setProperty("/modelDetails", []);
                return;
            }

            oViewModel.setProperty("/modelDetails", [oSelected]);
            oViewModel.setProperty("/showModelDetails", true);
        },


        onModelPrevious() {
            this.byId("BillingWizard").previousStep();
        },


        async onSaveAllocation() {

            const oViewModel = this.getView().getModel("view");
            const oODataModel = this.getView().getModel();

            const aModels = oViewModel.getProperty("/Model") || [];
            const sDealerID = oViewModel.getProperty("/selectedDealerID");

            let dealerFund = parseFloat(oViewModel.getProperty("/fundAvailability")) || 0;

            if (!aModels.length) {
                sap.m.MessageBox.error("No models available.");
                return;
            }

            let totalOrderValue = 0;

            try {

                for (let model of aModels) {

                    const qty = parseInt(model.allocationQty, 10) || 0;
                    if (qty <= 0) continue;

                    const price = parseFloat(model.perBikeValue) || 0;
                    const orderValue = qty * price;

                    totalOrderValue += orderValue;

                    const oBinding = oODataModel.bindList("/DealerAllocations", null, null, null, {
                        $filter: `dealer_dealerID eq '${sDealerID}' and model_modelCode eq '${model.modelCode}'`
                    });

                    const aExisting = await oBinding.requestContexts();

                    if (aExisting.length > 0) {

                        const oContext = aExisting[0];

                        const existingQty = parseInt(oContext.getProperty("allocationQty"), 10) || 0;
                        const existingValue = parseFloat(oContext.getProperty("orderValue")) || 0;

                        oContext.setProperty("allocationQty", existingQty + qty);
                        oContext.setProperty("orderValue", existingValue + orderValue);

                    } else {

                        oODataModel.bindList("/DealerAllocations").create({
                            dealer_dealerID: sDealerID,
                            model_modelCode: model.modelCode,
                            allocationQty: qty,
                            orderValue: orderValue
                        });
                    }

                    const currentDepot = parseInt(model._context.getProperty("depotStock"), 10) || 0;
                    const currentAvailable = parseInt(model._context.getProperty("availableStock"), 10) || 0;
                    const currentAllocated = parseInt(model._context.getProperty("allocatedQty"), 10) || 0;

                    const newDepot = currentDepot - qty;
                    const newAvailable = currentAvailable - qty;
                    const newAllocated = currentAllocated + qty;

                    if (newDepot < 0 || newAvailable < 0) {
                        sap.m.MessageBox.error("Insufficient stock in depot.");
                        return;
                    }


                    model._context.setProperty("allocatedQty", newAllocated);
                    model._context.setProperty("depotStock", newDepot);
                    model._context.setProperty("availableStock", newAvailable);
                    model._context.setProperty("fundRequired", newAvailable * price);

                    model.allocationQty = 0;
                    model.orderValue = 0;
                    model.allocatedQty = newAllocated;
                    model.depotStock = newDepot;
                    model.availableStock = newAvailable;
                    model.fundRequired = newAvailable * price;

                }

                dealerFund = dealerFund - totalOrderValue;

                const oDealerBinding = oODataModel.bindContext(`/Dealer('${sDealerID}')`);
                await oDealerBinding.requestObject();

                const oDealerContext = oDealerBinding.getBoundContext();
                oDealerContext.setProperty("fundAvailability", dealerFund);


                await oODataModel.submitBatch("$auto");

                oViewModel.setProperty("/fundAvailability", dealerFund);

                this._calculateInitialTotals();
                oViewModel.setProperty("/calculateEnabled", false);
                oViewModel.setProperty("/saveEnabled", false);


                sap.m.MessageToast.show("Allocation saved successfully.");

            } catch (error) {

                console.error(error);
                sap.m.MessageBox.error("Error while saving allocation.");
            }
        }


    });
});
