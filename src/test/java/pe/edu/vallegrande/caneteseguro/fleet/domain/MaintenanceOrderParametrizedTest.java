package pe.edu.vallegrande.caneteseguro.fleet.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import pe.edu.vallegrande.caneteseguro.fleet.domain.exception.DomainException;
import pe.edu.vallegrande.caneteseguro.fleet.domain.model.MaintenanceOrder;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.MaintenanceType;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.OrderPriority;

import static org.junit.jupiter.api.Assertions.*;

class MaintenanceOrderParametrizedTest {

    @ParameterizedTest
    @EnumSource(MaintenanceType.class)
    @DisplayName("Should create orders with all supported maintenance types")
    void shouldCreateOrderWithAllMaintenanceTypes(MaintenanceType type) {
        MaintenanceOrder order = MaintenanceOrder.create(
                "ORD-2026-PARAM",
                "rec-01",
                "EUA-123",
                "ent-01",
                "12345678",
                null,
                type,
                OrderPriority.MEDIA,
                "Falla general de prueba",
                10000,
                null
        );

        assertNotNull(order);
        assertEquals(type, order.getMaintenanceType());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   "})
    @DisplayName("Should fail when failure reason is blank or spaces")
    void shouldFailWithInvalidReason(String invalidReason) {
        assertThrows(DomainException.class, () ->
                MaintenanceOrder.create(
                        "ORD-2026-FAIL",
                        "rec-01",
                        "EUA-123",
                        "ent-01",
                        "12345678",
                        null,
                        MaintenanceType.PREVENTIVO,
                        OrderPriority.BAJA,
                        invalidReason,
                        500,
                        null
                )
        );
    }
}
